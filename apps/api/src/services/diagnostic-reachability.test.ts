import { describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { depthForRating, isReachableAtStudentDepth } from './diagnostic-reachability.js';

const FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';

function analysisFor(moveSan: string): PositionAnalysis {
  return {
    fen: FEN,
    depth: 10,
    multiPv: 1,
    bestMove: moveSan,
    eval: { cp: 300, mateIn: null },
    lines: [{ moveUci: 'c4d6', moveSan, pvSan: [moveSan], cp: 300, mateIn: null }],
    features: {} as PositionAnalysis['features']
  };
}

describe('depthForRating', () => {
  test('interpolates depth along the elo curve, close to a nearby anchor', () => {
    // 500 -> 7 is a literal anchor; 510 sits close enough to still round to 7.
    expect(depthForRating(510)).toBe(7);
  });

  test('an expert-level rating maps to one of the deepest roster entries', () => {
    expect(depthForRating(2300)).toBeGreaterThanOrEqual(14);
  });
});

describe('isReachableAtStudentDepth', () => {
  test('true when the required move is the shallow search\'s own top choice', async () => {
    const analyzeAtDepth = vi.fn().mockResolvedValue(analysisFor('Nd6+'));

    const reachable = await isReachableAtStudentDepth({ analyzeAtDepth }, FEN, 'Nd6+', 500);

    expect(reachable).toBe(true);
    expect(analyzeAtDepth).toHaveBeenCalledWith(FEN, { depth: 7, multiPv: 1 });
  });

  test('false when the shallow search finds a different top move', async () => {
    const analyzeAtDepth = vi.fn().mockResolvedValue(analysisFor('Kb2'));

    const reachable = await isReachableAtStudentDepth({ analyzeAtDepth }, FEN, 'Nd6+', 500);

    expect(reachable).toBe(false);
  });
});
