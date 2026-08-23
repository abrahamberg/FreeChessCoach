import type { PositionFeatures } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { positionalTrend, strategyScore, type PositionalTrendInput } from './strategy-score.js';

const NEUTRAL_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function emptyFeatures(overrides: Partial<PositionFeatures> = {}): PositionFeatures {
  return {
    turn: 'white',
    boardState: 'none',
    availableMoves: [],
    mobility: { white: 0, black: 0 },
    controlledSquares: [],
    piecesUnderAttack: [],
    hangingPieces: [],
    underDefendedPieces: [],
    overloadedDefenders: [],
    centerControlScore: { white: 0, black: 0 },
    openFiles: [],
    semiOpenFiles: [],
    doubledPawns: [],
    isolatedPawns: [],
    passedPawns: [],
    targetsAttacked: [],
    forks: [],
    captureOpportunities: [],
    ...overrides
  };
}

function baseInput(overrides: Partial<PositionalTrendInput> = {}): PositionalTrendInput {
  return {
    color: 'white',
    fenAtOpeningEnd: NEUTRAL_FEN,
    featuresAtOpeningEnd: emptyFeatures(),
    fenAtFinal: NEUTRAL_FEN,
    featuresAtFinal: emptyFeatures(),
    quietMoveMobilityDeltas: [],
    ...overrides
  };
}

describe('positionalTrend', () => {
  test('pawn structure: new doubled/isolated pawns hurt, a new passed pawn helps', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtFinal: emptyFeatures({
          doubledPawns: [{ file: 'a', color: 'white', count: 2 }],
          isolatedPawns: [{ square: 'h2', color: 'white' }],
          passedPawns: [{ square: 'd6', color: 'white' }]
        })
      })
    );
    // -8*1 (doubled) -8*1 (isolated) +10*1 (passed) = -6
    expect(trend).toBeCloseTo(-6, 5);
  });

  test('ignores pawn structure changes belonging to the opponent', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtFinal: emptyFeatures({
          doubledPawns: [{ file: 'a', color: 'black', count: 2 }],
          isolatedPawns: [{ square: 'h7', color: 'black' }]
        })
      })
    );
    expect(trend).toBe(0);
  });

  test('space: 0.4x the mean mobility delta over the colour\'s quiet moves', () => {
    const trend = positionalTrend(baseInput({ quietMoveMobilityDeltas: [4, -2, 10] }));
    // mean = 4; 0.4 * 4 = 1.6
    expect(trend).toBeCloseTo(1.6, 5);
  });

  test('files: a major piece gaining an open file helps', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtFinal: emptyFeatures({
          controlledSquares: [{ square: 'd1', piece: 'r', color: 'white', squares: [] }],
          openFiles: ['d']
        })
      })
    );
    expect(trend).toBeCloseTo(6, 5);
  });

  test('files: a major piece on a file that is semi-open for this colour also counts', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtFinal: emptyFeatures({
          controlledSquares: [{ square: 'e1', piece: 'q', color: 'white', squares: [] }],
          semiOpenFiles: [{ file: 'e', openFor: 'white' }]
        })
      })
    );
    expect(trend).toBeCloseTo(6, 5);
  });

  test('files: does not count a minor piece or the opponent\'s major piece', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtFinal: emptyFeatures({
          controlledSquares: [
            { square: 'd1', piece: 'n', color: 'white', squares: [] },
            { square: 'f1', piece: 'r', color: 'black', squares: [] }
          ],
          openFiles: ['d', 'f']
        })
      })
    );
    expect(trend).toBe(0);
  });

  test('centre: a growing centre-control advantage helps', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtOpeningEnd: emptyFeatures({ centerControlScore: { white: 2, black: 4 } }),
        featuresAtFinal: emptyFeatures({ centerControlScore: { white: 5, black: 1 } })
      })
    );
    // before advantage = -2, after advantage = +4, delta = 6, clamped trend at +-15
    const clamped = Math.min(5 * 6, 15);
    expect(trend).toBeCloseTo(clamped, 5);
  });

  test('king safety: escape squares shrinking under >= 2 opponent attackers is penalized', () => {
    const beforeFen = NEUTRAL_FEN;
    const afterFen = '3rkr2/8/8/8/8/8/8/4K3 w - - 0 1';
    const trend = positionalTrend(baseInput({ fenAtOpeningEnd: beforeFen, fenAtFinal: afterFen }));
    expect(trend).toBe(-10);
  });

  test('king safety: no penalty when escape squares are not shrinking', () => {
    const trend = positionalTrend(baseInput({ fenAtOpeningEnd: NEUTRAL_FEN, fenAtFinal: NEUTRAL_FEN }));
    expect(trend).toBe(0);
  });

  test('clamps the overall trend to +-15', () => {
    const trend = positionalTrend(
      baseInput({
        featuresAtOpeningEnd: emptyFeatures({ centerControlScore: { white: 0, black: 10 } }),
        featuresAtFinal: emptyFeatures({ centerControlScore: { white: 10, black: 0 } })
      })
    );
    expect(trend).toBe(15);
  });
});

describe('strategyScore', () => {
  test('returns null with a reason when fewer than 4 quiet positions were seen', () => {
    expect(strategyScore(3, 80, 5)).toEqual({ score: null, reason: 'insufficient quiet positions' });
  });

  test('returns null when quietAccuracy itself is null even with enough quiet positions', () => {
    expect(strategyScore(10, null, 5)).toEqual({ score: null, reason: 'insufficient quiet positions' });
  });

  test('combines quietAccuracy with the trend', () => {
    expect(strategyScore(10, 80, 5)).toEqual({ score: 85 });
  });

  test('clamps the final score to [0, 100]', () => {
    expect(strategyScore(10, 95, 15)).toEqual({ score: 100 });
    expect(strategyScore(10, 5, -15)).toEqual({ score: 0 });
  });
});
