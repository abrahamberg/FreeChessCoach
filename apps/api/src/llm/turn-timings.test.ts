import { describe, expect, test } from 'vitest';
import { createTurnTimer } from './turn-timings.js';

describe('createTurnTimer', () => {
  test('keeps model calls and tools in the order they finished, each with when it ended', () => {
    let clock = 1_000;
    const timer = createTurnTimer(() => clock);

    clock = 1_400;
    timer.modelCallEnded({ responseTimeMs: 400, timeToFirstOutputMs: 120, outputTokens: 30, finishReason: 'tool-calls', toolNames: ['get_user_profile'] });
    clock = 1_450;
    timer.toolEnded({ toolName: 'get_user_profile', durationMs: 48.6, ok: true });
    clock = 2_500;
    timer.modelCallEnded({ responseTimeMs: 1_050, timeToFirstOutputMs: undefined, outputTokens: 200, finishReason: 'stop', toolNames: [] });

    const timings = timer.finish();
    expect(timings.totalMs).toBe(1_500);
    expect(timings.entries.map((entry) => [entry.kind, entry.atMs, entry.durationMs])).toEqual([
      ['model', 400, 400],
      ['tool', 450, 49],
      ['model', 1_500, 1_050]
    ]);
    expect(timings.entries[2]).toMatchObject({ firstOutputMs: null, calls: [] });
  });
});
