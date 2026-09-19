import { describe, expect, it, vi } from 'vitest';
import { readCoachStream } from '../hooks/coachStream.js';
import { scriptedStreamResponse } from './scriptedStream.js';

const instant = { thinkingMs: 0, chunkMs: 0, sleep: () => Promise.resolve() };

async function readAll(response: Response): Promise<{ text: string; toolCalls: unknown[] }> {
  let text = '';
  const toolCalls: unknown[] = [];
  await readCoachStream(response.body!, {
    onTextDelta: (delta) => {
      text += delta;
    },
    onToolCall: (call) => {
      toolCalls.push(call);
      return Promise.resolve();
    },
    onError: (message) => {
      throw new Error(message);
    }
  });
  return { text, toolCalls };
}

describe('scriptedStreamResponse', () => {
  it('streams the text so the real coach stream reader reassembles it exactly', async () => {
    const text = "It does hit f6, good. Now a different question.\n\nWhere was that knight a move ago?";
    const response = scriptedStreamResponse([{ kind: 'text', text }], instant);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect((await readAll(response)).text).toBe(text);
  });

  it('sends the show_position call the browser answers with a follow-up POST', async () => {
    const response = scriptedStreamResponse(
      [
        { kind: 'text', text: 'Hold that thought.' },
        { kind: 'show_position', moveNumber: 37, color: 'white' }
      ],
      instant
    );
    const { text, toolCalls } = await readAll(response);
    expect(text).toBe('Hold that thought.');
    expect(toolCalls).toEqual([
      { toolCallId: expect.any(String), toolName: 'show_position', input: { moveNumber: 37, color: 'white' } }
    ]);
  });

  it('calls onDone only once the last chunk has been read', async () => {
    const onDone = vi.fn();
    const response = scriptedStreamResponse([{ kind: 'text', text: 'Hello there.' }], instant, onDone);
    expect(onDone).not.toHaveBeenCalled();
    await readAll(response);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('waits before the first word so the thinking indicator shows, then paces the chunks', async () => {
    const waits: number[] = [];
    const response = scriptedStreamResponse([{ kind: 'text', text: 'one two three four five six seven' }], {
      thinkingMs: 1200,
      chunkMs: 30,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      }
    });
    await readAll(response);
    expect(waits[0]).toBe(1200);
    expect(waits.slice(1).every((ms) => ms === 30)).toBe(true);
    expect(waits.length).toBeGreaterThan(2);
  });
});
