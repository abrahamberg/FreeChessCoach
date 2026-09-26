import { describe, expect, test } from 'vitest';
import type { ChatMessage } from './messages.js';
import { UNANSWERED_TOOL_RESULT, answerUnansweredToolCalls } from './unanswered-tool-calls.js';

const call = (toolCallId: string, toolName = 'show_position'): ChatMessage => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId, toolName, input: {} }]
});

const result = (toolCallId: string, toolName = 'show_position'): ChatMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId, toolName, output: { type: 'json', value: { ok: true } } }]
});

describe('answerUnansweredToolCalls', () => {
  test('leaves a history whose calls all have results as it is', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }, call('a'), result('a')];
    expect(answerUnansweredToolCalls(messages)).toEqual(messages);
  });

  // Regression: a puzzle session's show_position was never answered by the
  // client, and every later turn failed with MissingToolResultsError.
  test('puts a stand-in result right after a call that never got one', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'king ?' }, call('a'), { role: 'user', content: 'hello' }];

    const repaired = answerUnansweredToolCalls(messages);

    expect(repaired).toHaveLength(4);
    expect(repaired[2]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'show_position',
          output: { type: 'text', value: UNANSWERED_TOOL_RESULT }
        }
      ]
    });
    expect(repaired[3]).toEqual({ role: 'user', content: 'hello' });
  });
});
