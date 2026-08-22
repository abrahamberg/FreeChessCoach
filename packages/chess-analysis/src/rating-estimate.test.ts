import { describe, expect, test } from 'vitest';
import {
  accuracyToElo,
  combinedRawRating,
  complexity,
  errorRating,
  estimateRating,
  movesPlayedExcludingForcedSequences
} from './rating-estimate.js';

describe('accuracyToElo', () => {
  test('reproduces the §8.2 anchor table exactly', () => {
    const table: [number, number][] = [
      [40, 250],
      [50, 450],
      [60, 750],
      [65, 950],
      [70, 1150],
      [75, 1380],
      [80, 1620],
      [84, 1870],
      [88, 2120],
      [91, 2360],
      [94, 2620],
      [97, 2900],
      [99, 3100]
    ];
    for (const [accuracy, elo] of table) {
      expect(accuracyToElo(accuracy)).toBe(elo);
    }
  });

  test('interpolates linearly between two anchors', () => {
    // Halfway between 40->250 and 50->450 is 45 -> 350.
    expect(accuracyToElo(45)).toBeCloseTo(350, 5);
  });

  test('flat extrapolation below the lowest anchor', () => {
    expect(accuracyToElo(0)).toBe(250);
    expect(accuracyToElo(20)).toBe(250);
  });

  test('flat extrapolation above the highest anchor', () => {
    expect(accuracyToElo(100)).toBe(3100);
  });
});

describe('errorRating', () => {
  test('an error-free game scores the base 2600', () => {
    expect(errorRating({ inaccuracy: 0, mistake: 0, blunder: 0, miss: 0 }, 40)).toBe(2600);
  });

  test('applies the per-100-move weighted penalty', () => {
    // per100(inaccuracy)=100*2/40=5, per100(mistake)=100*1/40=2.5, per100(blunder+miss)=100*1/40=2.5
    // 2600 - 26*5 - 55*2.5 - 95*2.5 = 2600 - 130 - 137.5 - 237.5 = 2095
    expect(errorRating({ inaccuracy: 2, mistake: 1, blunder: 1, miss: 0 }, 40)).toBeCloseTo(2095, 5);
  });

  test('clamps to [100, 3200]', () => {
    expect(errorRating({ inaccuracy: 0, mistake: 0, blunder: 20, miss: 20 }, 10)).toBe(100);
  });
});

describe('combinedRawRating', () => {
  test('applies the 0.65/0.35 weighted sum', () => {
    expect(combinedRawRating(2000, 1000)).toBeCloseTo(0.65 * 2000 + 0.35 * 1000, 5);
  });
});

describe('complexity', () => {
  test('clamps low volatility up to 0.5', () => {
    expect(complexity(0.5)).toBe(0.5);
  });

  test('clamps high volatility down to 1.5', () => {
    expect(complexity(12)).toBe(1.5);
  });

  test('scales linearly in between (divide by 4)', () => {
    expect(complexity(4)).toBe(1);
  });
});

describe('movesPlayedExcludingForcedSequences', () => {
  test('a short forced run (<=8) stays counted as ordinary play', () => {
    const qualities = ['good', 'forced', 'forced', 'good'] as const;
    expect(movesPlayedExcludingForcedSequences(qualities)).toBe(4);
  });

  test('a forced run longer than 8 is excluded entirely, not just the excess', () => {
    const qualities = ['good', ...Array(9).fill('forced'), 'good'] as const;
    // 11 total plies, 9 of them one long forced run (>8) -> excluded entirely.
    expect(movesPlayedExcludingForcedSequences(qualities)).toBe(2);
  });

  test('multiple forced runs are evaluated independently', () => {
    const qualities = [
      'good',
      ...Array(9).fill('forced'), // long run, excluded
      'good',
      'forced',
      'forced', // short run, kept
      'good'
    ] as const;
    // 14 total plies, 9 of them one long forced run (>8) excluded -> 5.
    expect(movesPlayedExcludingForcedSequences(qualities)).toBe(5);
  });
});

describe('estimateRating', () => {
  test('returns null with a reason under the 12-move minimum', () => {
    expect(estimateRating({ raw: 1500, complexity: 1, movesPlayed: 11, prior: null })).toEqual({
      value: null,
      range: null,
      reason: 'insufficient moves'
    });
  });

  test('shrinks toward the default 1200 prior and reports a range', () => {
    const result = estimateRating({ raw: 1500, complexity: 1, movesPlayed: 20, prior: null });
    // nEff=20; (20*1500 + 14*1200)/34 = 46800/34 = 1376.47 -> nearest 25 = 1375
    expect(result.value).toBe(1375);
    // stdErr = 260/sqrt(20/10) = 183.85; range = [1192.6, 1560.3] -> [1200, 1550]
    expect(result.range).toEqual([1200, 1550]);
  });

  test('shrinks toward a known prior rating instead of the default', () => {
    const withPrior = estimateRating({ raw: 1500, complexity: 1, movesPlayed: 20, prior: 1800 });
    const withDefault = estimateRating({ raw: 1500, complexity: 1, movesPlayed: 20, prior: null });
    expect(withPrior.value).not.toBe(withDefault.value);
  });

  test('caps a wildly inflated single-game estimate at prior + 600', () => {
    // A 15-move miniature where the opponent blundered a queen should not
    // report anything close to 2800.
    const result = estimateRating({ raw: 2800, complexity: 1, movesPlayed: 15, prior: null });
    expect(result.value).toBeLessThanOrEqual(1800);
    expect(result.value).toBe(1800);
  });

  test('a higher effective move count narrows the range', () => {
    const short = estimateRating({ raw: 1500, complexity: 1, movesPlayed: 12, prior: null });
    const long = estimateRating({ raw: 1500, complexity: 1, movesPlayed: 60, prior: null });
    const width = (range: [number, number] | null) => (range ? range[1] - range[0] : Infinity);
    expect(width(long.range)).toBeLessThan(width(short.range));
  });
});
