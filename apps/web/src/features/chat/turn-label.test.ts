import { describe, expect, test } from 'vitest';
import { turnLabel } from './turn-label.js';
import type { DebugTurnView } from './useTurnDebugSnapshot.js';

const turn = (messages: unknown[], at: string | null = null): DebugTurnView => ({ at, snapshot: { request: { messages } } as unknown as DebugTurnView['snapshot'] });

describe('turnLabel', () => {
  test('a turn with no time is the latest one', () => {
    expect(turnLabel({ at: null, snapshot: null })).toBe('latest');
  });

  test("names the turn by the student's last words, cut to fit", () => {
    expect(turnLabel(turn([{ role: 'user', content: 'first' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'why not Nf3?' }]))).toBe('latest · why not Nf3?');
    expect(turnLabel(turn([{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(40) }] }]))).toBe(`latest · ${'x'.repeat(27)}…`);
    expect(turnLabel(turn([{ role: 'assistant', content: 'hello' }]))).toBe('latest');
  });
});
