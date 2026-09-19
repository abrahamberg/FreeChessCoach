import { describe, expect, it, vi } from 'vitest';
import { readCoachStream } from '../hooks/coachStream.js';
import { DemoConversation } from './demoConversation.js';
import type { RecordedMessage } from './conversationScript.js';

const instant = { thinkingMs: 0, chunkMs: 0, sleep: () => Promise.resolve() };
const a = (id: string, text: string, show?: { moveNumber: number; color: 'white' | 'black' }): RecordedMessage => ({
  id,
  role: 'assistant',
  content: [{ type: 'text', text }, ...(show ? [{ type: 'tool-call', toolName: 'show_position', input: show }] : [])]
});
const u = (id: string, text: string): RecordedMessage => ({ id, role: 'user', content: [{ type: 'text', text }] });

const RECORDED = [
  a('1', 'Welcome.'),
  u('2', 'It attacks f6.'),
  a('3', 'Good.'),
  a('4', 'Now move 37.', { moveNumber: 37, color: 'white' }),
  u('5', 'They took my queen.'),
  a('6', 'Look down the file.')
];

async function text(response: Response): Promise<{ text: string; tools: string[] }> {
  let out = '';
  const tools: string[] = [];
  await readCoachStream(response.body!, {
    onTextDelta: (d) => {
      out += d;
    },
    onToolCall: (c) => {
      tools.push(c.toolName);
      return Promise.resolve();
    },
    onError: (m) => {
      throw new Error(m);
    }
  });
  return { text: out, tools };
}

describe('DemoConversation', () => {
  it('offers the first student line first, and nothing once the script is used up', async () => {
    const demo = new DemoConversation(RECORDED, instant);
    expect(demo.state().nextLine).toBe('It attacks f6.');
    await text(demo.reply({ content: 'It attacks f6.' }));
    expect(demo.state().nextLine).toBe('They took my queen.');
    await text(demo.reply({ content: 'x' }));
    expect(demo.state().nextLine).toBeNull();
  });

  it('plays a turn across the show_position round trip', async () => {
    const demo = new DemoConversation(RECORDED, instant);
    const first = await text(demo.reply({ content: 'It attacks f6.' }));
    expect(first).toEqual({ text: 'Good.', tools: ['show_position'] });
    const second = await text(demo.reply({ clientToolResult: { toolCallId: 'x', toolName: 'show_position', result: {} } }));
    expect(second).toEqual({ text: 'Now move 37.', tools: [] });
  });

  it('sends a plain problem response when the script has run out', () => {
    const demo = new DemoConversation([a('1', 'Hi.')], instant);
    expect(demo.reply({ content: 'anything' }).status).toBe(409);
  });

  it('reopens with the history plus only what has been played so far', async () => {
    const demo = new DemoConversation(RECORDED, instant);
    expect(demo.visibleMessages().map((m) => m.id)).toEqual(['1']);
    await text(demo.reply({ content: 'x' }));
    expect(demo.visibleMessages().map((m) => m.id)).toEqual(['1', '2', '3', '4']);
  });

  it('stays busy until the whole reply, including the board-move round trip, has streamed', async () => {
    const demo = new DemoConversation(RECORDED, instant);
    expect(demo.state()).toEqual({ nextLine: 'It attacks f6.', busy: false });
    const first = demo.reply({ content: 'x' });
    expect(demo.state().busy).toBe(true);
    await text(first);
    expect(demo.state().busy).toBe(true); // the coach has moved the board and is waiting for the answer
    await text(demo.reply({ clientToolResult: {} }));
    expect(demo.state()).toEqual({ nextLine: 'They took my queen.', busy: false });
  });

  it('tells subscribers when the next line changes', async () => {
    const demo = new DemoConversation(RECORDED, instant);
    const listener = vi.fn();
    const unsubscribe = demo.subscribe(listener);
    await text(demo.reply({ content: 'x' }));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await text(demo.reply({ content: 'y' }));
    expect(listener).not.toHaveBeenCalled();
  });
});
