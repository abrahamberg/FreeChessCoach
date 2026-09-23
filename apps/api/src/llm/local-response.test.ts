import { describe, expect, test } from 'vitest';
import { LocalModelEmptyAnswerError, parseLocalCompletion, splitThinking } from './local-response.js';
import { LocalStreamMapper } from './local-stream.js';

function completion(message: object, finish = 'stop'): unknown {
  return { choices: [{ message, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
}

describe('parseLocalCompletion', () => {
  test('separates reasoning_content from the answer', () => {
    const parsed = parseLocalCompletion(completion({ content: 'OK', reasoning_content: 'hmm' }), false);
    expect(parsed.content).toEqual([
      { type: 'reasoning', text: 'hmm' },
      { type: 'text', text: 'OK' }
    ]);
  });

  test('splits an inline <think> block off the answer', () => {
    const parsed = parseLocalCompletion(completion({ content: '<think>\nhmm\n</think>\n\nOK' }), false);
    expect(parsed.content).toEqual([
      { type: 'reasoning', text: 'hmm' },
      { type: 'text', text: 'OK' }
    ]);
  });

  test('says the model spent its budget thinking when it gave no answer', () => {
    expect(() => parseLocalCompletion(completion({ content: null, reasoning_content: 'hmm' }, 'length'), false)).toThrow(
      LocalModelEmptyAnswerError
    );
  });

  test('passes tool calls through with their argument text', () => {
    const parsed = parseLocalCompletion(
      completion({ content: null, tool_calls: [{ id: 'c1', function: { name: 'show_move', arguments: '{"ply":3}' } }] }, 'tool_calls'),
      false
    );
    expect(parsed.content).toEqual([{ type: 'tool-call', toolCallId: 'c1', toolName: 'show_move', input: '{"ply":3}' }]);
    expect(parsed.finishReason.unified).toBe('tool-calls');
  });

  test('pulls the JSON object out of a fenced answer for structured output', () => {
    const parsed = parseLocalCompletion(completion({ content: 'Here:\n```json\n{"a":1}\n```' }), true);
    expect(parsed.content).toEqual([{ type: 'text', text: '{"a":1}' }]);
  });
});

describe('splitThinking', () => {
  test('treats a bare closing tag as the end of thinking', () => {
    expect(splitThinking('hmm</think>OK')).toEqual({ reasoning: 'hmm', text: 'OK' });
  });
  test('leaves text without tags alone', () => {
    expect(splitThinking('OK')).toEqual({ reasoning: '', text: 'OK' });
  });
});

function chunk(delta: object, finish: string | null = null): string {
  return JSON.stringify({ choices: [{ delta, finish_reason: finish }] });
}

describe('LocalStreamMapper', () => {
  test('streams inline thinking as reasoning, even when the tags are split across chunks', () => {
    const mapper = new LocalStreamMapper();
    const parts = [
      ...mapper.push(chunk({ content: '<thi' })),
      ...mapper.push(chunk({ content: 'nk>hm' })),
      ...mapper.push(chunk({ content: 'm</th' })),
      ...mapper.push(chunk({ content: 'ink>OK' }, 'stop')),
      ...mapper.finish()
    ];
    const reasoning = parts.flatMap((p) => (p.type === 'reasoning-delta' ? [p.delta] : [])).join('');
    const text = parts.flatMap((p) => (p.type === 'text-delta' ? [p.delta] : [])).join('');
    expect(reasoning).toBe('hmm');
    expect(text).toBe('OK');
    expect(parts.at(-1)).toMatchObject({ type: 'finish', finishReason: { unified: 'stop' } });
  });

  test('emits reasoning_content deltas as soon as they arrive', () => {
    const mapper = new LocalStreamMapper();
    expect(mapper.push(chunk({ reasoning_content: 'hm' }))).toEqual([
      { type: 'reasoning-start', id: 'reasoning-0' },
      { type: 'reasoning-delta', id: 'reasoning-0', delta: 'hm' }
    ]);
  });

  test('assembles streamed tool calls and ends them with a complete tool-call', () => {
    const mapper = new LocalStreamMapper();
    const parts = [
      ...mapper.push(chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'show_move', arguments: '{"pl' } }] })),
      ...mapper.push(chunk({ tool_calls: [{ index: 0, function: { arguments: 'y":3}' } }] }, 'tool_calls')),
      ...mapper.finish()
    ];
    expect(parts.find((p) => p.type === 'tool-call')).toEqual({ type: 'tool-call', toolCallId: 'c1', toolName: 'show_move', input: '{"ply":3}' });
    expect(parts.filter((p) => p.type === 'tool-input-delta').map((p) => (p.type === 'tool-input-delta' ? p.delta : ''))).toEqual(['{"pl', 'y":3}']);
  });

  test('plain text without tags streams as text', () => {
    const mapper = new LocalStreamMapper();
    const parts = [...mapper.push(chunk({ content: 'Hello' })), ...mapper.finish()];
    expect(parts.filter((p) => p.type === 'text-delta')).toHaveLength(1);
  });
});
