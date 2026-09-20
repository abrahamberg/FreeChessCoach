import type { BotThinkingMove } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { describeMoveHeading, formatBotThinkingLog, formatDuration, stepDurationMs } from './botThinkingFormat.js';

function move(overrides: Partial<BotThinkingMove> = {}): BotThinkingMove {
  return {
    ply: 2,
    source: 'turn',
    status: 'done',
    startedAt: 10_000,
    endedAt: 11_400,
    path: 'top moves — best move',
    picked: 'e5',
    engineMode: 'internal',
    steps: [
      { id: 1, label: 'Grading your move and saving it', detail: 'saved', startedAt: 10_000, endedAt: 10_310, status: 'done' },
      { id: 2, label: 'Engine search (attempt 1 of 3)', detail: '2 lines returned', startedAt: 10_310, endedAt: 11_200, status: 'done' }
    ],
    ...overrides
  };
}

describe('formatDuration', () => {
  test.each([
    [0, '0ms'],
    [42, '42ms'],
    [999, '999ms'],
    [1000, '1.00s'],
    [3456, '3.46s'],
    [125_000, '125.00s']
  ])('%i ms reads as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  test('never shows a negative duration', () => {
    expect(formatDuration(-5)).toBe('0ms');
  });
});

describe('stepDurationMs', () => {
  test('a finished step uses its own end', () => {
    expect(stepDurationMs(move().steps[0]!, 99_999)).toBe(310);
  });

  test('a running step counts up to now', () => {
    const running = { id: 3, label: 'Engine search', startedAt: 10_000, endedAt: null, status: 'running' as const };
    expect(stepDurationMs(running, 14_500)).toBe(4500);
  });
});

describe('describeMoveHeading', () => {
  test('numbers the move from the ply and names who is moving', () => {
    expect(describeMoveHeading(move({ ply: 1 }))).toBe('Move 1 · White (ply 1)');
    expect(describeMoveHeading(move({ ply: 2 }))).toBe('Move 1 · Black (ply 2)');
    expect(describeMoveHeading(move({ ply: 5 }))).toBe('Move 3 · White (ply 5)');
  });

  test('copes with a ply the server did not know yet', () => {
    expect(describeMoveHeading(move({ ply: null }))).toBe('Bot move');
  });
});

describe('formatBotThinkingLog', () => {
  test('writes each move as a heading plus its steps with offset, duration and detail', () => {
    const text = formatBotThinkingLog([move()], 20_000);

    expect(text).toContain('Move 1 · Black (ply 2) — done in 1.40s — played e5 — top moves — best move — engine: internal — from: turn');
    expect(text).toContain('+0ms      310ms  Grading your move and saving it — saved');
    expect(text).toContain('+310ms    890ms  Engine search (attempt 1 of 3) — 2 lines returned');
  });

  test('a move still thinking counts up to now and marks its running step', () => {
    const thinking = move({
      status: 'thinking',
      endedAt: null,
      path: null,
      picked: null,
      steps: [{ id: 1, label: 'Engine search (attempt 1 of 3)', startedAt: 10_000, endedAt: null, status: 'running' }]
    });

    const text = formatBotThinkingLog([thinking], 16_250);

    expect(text).toContain('Move 1 · Black (ply 2) — THINKING for 6.25s');
    expect(text).toContain('6.25s  Engine search (attempt 1 of 3) [running]');
  });

  test('marks a failed step and a failed move', () => {
    const failed = move({
      status: 'failed',
      steps: [{ id: 1, label: 'Engine search (attempt 1 of 3)', detail: 'engine down', startedAt: 10_000, endedAt: 10_500, status: 'failed' }]
    });

    const text = formatBotThinkingLog([failed], 20_000);

    expect(text).toContain('FAILED after 1.40s');
    expect(text).toContain('Engine search (attempt 1 of 3) [failed] — engine down');
  });

  test('separates moves with a blank line, oldest first, and says so when empty', () => {
    const text = formatBotThinkingLog([move({ ply: 2 }), move({ ply: 4 })], 20_000);
    expect(text.indexOf('ply 2')).toBeLessThan(text.indexOf('ply 4'));
    expect(text).toContain('\n\nMove 2');
    expect(formatBotThinkingLog([], 0)).toBe('No bot moves recorded yet.');
  });
});
