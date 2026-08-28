import { describe, expect, test } from 'vitest';
import { scoreBotCandidates, sampleBotMove, type BotCandidate } from './bot-candidate-score.js';
import type { BotPersonality } from '@freechesscoach/shared';

const NEUTRAL_PERSONALITY: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };

function candidate(overrides: Partial<BotCandidate> = {}): BotCandidate {
  return {
    moveSan: 'e4',
    cp: 0,
    mateIn: null,
    createsFork: false,
    createsHangingPiece: false,
    createsUnderDefendedPiece: false,
    mobilityDelta: 0,
    forkInPlies: null,
    ...overrides
  };
}

describe('scoreBotCandidates', () => {
  test('aggression rewards a candidate that creates a hanging piece', () => {
    const personality: BotPersonality = { ...NEUTRAL_PERSONALITY, aggression: 100 };
    const [hangs, quiet] = scoreBotCandidates(
      [candidate({ moveSan: 'a', createsHangingPiece: true }), candidate({ moveSan: 'b' })],
      personality
    );

    expect(hangs?.score).toBeGreaterThan(quiet?.score ?? 0);
  });

  test('aggression rewards positive mobility gain, capped rather than unbounded', () => {
    const personality: BotPersonality = { ...NEUTRAL_PERSONALITY, aggression: 100 };
    const [atCap, overCap, none] = scoreBotCandidates(
      [
        candidate({ moveSan: 'a', mobilityDelta: 4 }),
        candidate({ moveSan: 'b', mobilityDelta: 10 }),
        candidate({ moveSan: 'c', mobilityDelta: 0 })
      ],
      personality
    );

    expect(atCap?.score).toBeGreaterThan(none?.score ?? 0);
    expect(atCap?.score).toBeCloseTo(overCap?.score ?? NaN, 10);
  });

  test('trapSeeking rewards a candidate that creates a fork', () => {
    const personality: BotPersonality = { ...NEUTRAL_PERSONALITY, trapSeeking: 100 };
    const [forks, quiet] = scoreBotCandidates(
      [candidate({ moveSan: 'a', createsFork: true }), candidate({ moveSan: 'b' })],
      personality
    );

    expect(forks?.score).toBeGreaterThan(quiet?.score ?? 0);
  });

  test('trapSeeking rewards a nearer forkInPlies more than a farther one', () => {
    const personality: BotPersonality = { ...NEUTRAL_PERSONALITY, trapSeeking: 100 };
    const [near, far] = scoreBotCandidates(
      [candidate({ moveSan: 'a', forkInPlies: 1 }), candidate({ moveSan: 'b', forkInPlies: 5 })],
      personality
    );

    expect(near?.score).toBeGreaterThan(far?.score ?? 0);
  });

  test('defensiveness penalizes a candidate that creates an under-defended piece and favors a quiet one', () => {
    const personality: BotPersonality = { ...NEUTRAL_PERSONALITY, defensiveness: 100 };
    const [risky, quiet] = scoreBotCandidates(
      [
        candidate({ moveSan: 'a', createsUnderDefendedPiece: true, mobilityDelta: -1 }),
        candidate({ moveSan: 'b', createsUnderDefendedPiece: false, mobilityDelta: 0 })
      ],
      personality
    );

    expect(quiet?.score).toBeGreaterThan(risky?.score ?? 0);
  });

  test('base evaluation dominates personality: a losing move never outscores a winning one', () => {
    const maxPersonality: BotPersonality = { aggression: 100, trapSeeking: 100, defensiveness: 100 };
    const [aboutToBeMated, deliversMate] = scoreBotCandidates(
      [
        candidate({
          moveSan: 'losing',
          mateIn: -1,
          createsFork: true,
          createsHangingPiece: true,
          mobilityDelta: 10,
          forkInPlies: 1
        }),
        candidate({ moveSan: 'winning', mateIn: 1 })
      ],
      maxPersonality
    );

    expect(aboutToBeMated?.score).toBeLessThan(deliversMate?.score ?? -Infinity);
  });
});

describe('sampleBotMove', () => {
  test('throws on an empty candidate list', () => {
    expect(() => sampleBotMove([], 0.5, () => 0)).toThrow();
  });

  test('with equal-scored candidates, random() near 0 picks the first', () => {
    const scored = scoreBotCandidates(
      [candidate({ moveSan: 'a' }), candidate({ moveSan: 'b' }), candidate({ moveSan: 'c' })],
      NEUTRAL_PERSONALITY
    );

    expect(sampleBotMove(scored, 1, () => 0).moveSan).toBe('a');
  });

  test('with equal-scored candidates, random() near 1 picks the last', () => {
    const scored = scoreBotCandidates(
      [candidate({ moveSan: 'a' }), candidate({ moveSan: 'b' }), candidate({ moveSan: 'c' })],
      NEUTRAL_PERSONALITY
    );

    expect(sampleBotMove(scored, 1, () => 0.9999999999).moveSan).toBe('c');
  });

  test('temperature 0 concentrates virtually all probability mass on the top-scored candidate', () => {
    // Wide eval gap (near-clamp cp values) so the win-probability slope
    // produces an astronomically lopsided softmax at the clamped minimum
    // temperature — a ~50cp gap alone isn't nearly enough to swamp the
    // other candidates' share at this slope constant.
    const scored = scoreBotCandidates(
      [candidate({ moveSan: 'weak', cp: -2000 }), candidate({ moveSan: 'best', cp: 2000 }), candidate({ moveSan: 'ok', cp: 0 })],
      NEUTRAL_PERSONALITY
    );

    // Both extreme boundaries (random() near 0 or near 1) are degenerate:
    // whichever candidate occupies that end of cumulative-weight order still
    // holds *some* residual mass even when it's a tiny fraction of the
    // total, so an r right at the edge can still land in it. Mid-range
    // values reliably fall within the dominant candidate's much larger
    // share instead.
    for (const randomValue of [0.001, 0.5, 0.99]) {
      expect(sampleBotMove(scored, 0, () => randomValue).moveSan).toBe('best');
    }
  });
});
