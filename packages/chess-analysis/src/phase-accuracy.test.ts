import { describe, expect, test } from 'vitest';
import { phaseAccuracy, type PhaseAccuracyMove } from './phase-accuracy.js';
import { aggregateAccuracy, accuracyForAggregate } from './game-accuracy.js';

function move(overrides: Partial<PhaseAccuracyMove>): PhaseAccuracyMove {
  return {
    ply: 1,
    mover: 'white',
    quality: 'good',
    drop: 5,
    phase: 'opening',
    ...overrides
  };
}

describe('phaseAccuracy', () => {
  test('restricts to the given colour and phase', () => {
    const moves = [
      move({ ply: 1, mover: 'white', phase: 'opening', quality: 'best', drop: 0 }),
      move({ ply: 2, mover: 'black', phase: 'opening', quality: 'blunder', drop: 60 }),
      move({ ply: 3, mover: 'white', phase: 'middlegame', quality: 'blunder', drop: 60 })
    ];
    const weights = new Map([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);

    const expected = aggregateAccuracy([accuracyForAggregate('best', 0)], [3]);
    expect(phaseAccuracy('white', 'opening', moves, weights)).toBe(expected);
  });

  test('returns null when the colour played no moves in that phase', () => {
    const moves = [move({ ply: 1, mover: 'white', phase: 'endgame' })];
    const weights = new Map([[1, 3]]);
    expect(phaseAccuracy('white', 'opening', moves, weights)).toBeNull();
  });

  test('uses the full-game weight for each ply, not a weight recomputed from only the phase-restricted plies', () => {
    const moves = [
      move({ ply: 1, mover: 'white', phase: 'opening', quality: 'good', drop: 5 }),
      move({ ply: 3, mover: 'white', phase: 'opening', quality: 'blunder', drop: 40 })
    ];
    // Deliberately lopsided full-game weights (as if computed over a much
    // more volatile whole game) that a per-phase-only recompute would never
    // produce — phaseAccuracy must use exactly these, not derive its own.
    const fullGameWeights = new Map([
      [1, 0.5],
      [3, 12]
    ]);

    const accs = [accuracyForAggregate('good', 5), accuracyForAggregate('blunder', 40)];
    const expected = aggregateAccuracy(accs, [0.5, 12]);
    expect(phaseAccuracy('white', 'opening', moves, fullGameWeights)).toBe(expected);
  });

  test('applies the book-move accuracy override per move (§4.4) before aggregating', () => {
    const moves = [move({ ply: 1, mover: 'white', phase: 'opening', quality: 'book', drop: 3 })];
    const weights = new Map([[1, 2]]);
    expect(phaseAccuracy('white', 'opening', moves, weights)).toBeCloseTo(100, 0);
  });
});
