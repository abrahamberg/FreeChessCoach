import { describe, expect, test } from 'vitest';
import { computeHumanReachability, isHumanReachable } from './reachability.js';

describe('computeHumanReachability', () => {
  test('a mate-in-one — top rank, forcing, one-ply solution, sizeable material — scores near 1', () => {
    const score = computeHumanReachability({ rank: 0, isForcing: true, solutionPlies: 1, seeGain: 900 });

    expect(score).toBeGreaterThanOrEqual(0.9);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('a rank-5 quiet move requiring a 7-ply solution scores near 0', () => {
    const score = computeHumanReachability({ rank: 5, isForcing: false, solutionPlies: 7, seeGain: 0 });

    expect(score).toBeLessThan(0.15);
  });

  test('is monotonic in rank, holding every other input fixed', () => {
    const scores = Array.from({ length: 8 }, (_, rank) =>
      computeHumanReachability({ rank, isForcing: true, solutionPlies: 3, seeGain: 150 })
    );

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  test('is monotonic in solution length, holding every other input fixed', () => {
    const lengths = [1, 2, 3, 5, 8, 13];
    const results = lengths.map((solutionPlies) =>
      computeHumanReachability({ rank: 1, isForcing: false, solutionPlies, seeGain: 0 })
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i]!).toBeLessThanOrEqual(results[i - 1]!);
    }
  });

  test('never leaves [0, 1] even for out-of-range inputs', () => {
    expect(computeHumanReachability({ rank: -1, isForcing: true, solutionPlies: 0, seeGain: -50 })).toBeLessThanOrEqual(1);
    expect(computeHumanReachability({ rank: 500, isForcing: false, solutionPlies: 200, seeGain: 100000 })).toBeGreaterThanOrEqual(0);
  });

  test('stacking every favorable input is strictly better than any single one alone', () => {
    const allFavorable = computeHumanReachability({ rank: 0, isForcing: true, solutionPlies: 1, seeGain: 900 });
    const rankOnly = computeHumanReachability({ rank: 0, isForcing: false, solutionPlies: 20, seeGain: 0 });

    expect(allFavorable).toBeGreaterThan(rankOnly);
  });
});

describe('isHumanReachable', () => {
  test('a near-1 score clears the DQ-05 bar', () => {
    expect(isHumanReachable(0.9)).toBe(true);
  });

  test('a near-0 score does not clear the DQ-05 bar', () => {
    expect(isHumanReachable(0.05)).toBe(false);
  });
});
