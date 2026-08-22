import { describe, expect, test } from 'vitest';
import { accuracyForAggregate, aggregateAccuracy, volatilityWeights } from './game-accuracy.js';
import { moveAccuracy } from './accuracy-curve.js';

describe('volatilityWeights', () => {
  test('clamps the window size to a minimum of 2 for a short, quiet game', () => {
    // 10 positions (N=9 plies): ceil(10/10) = 1, clamped up to 2.
    const series = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const weights = volatilityWeights(series, [1, 3, 5]);
    // A constant window has 0 stdev, clamped up to the 0.5 floor.
    expect(weights).toEqual([0.5, 0.5, 0.5]);
  });

  test('a volatile window produces a higher weight, clamped at 12', () => {
    const series = [50, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100];
    const weights = volatilityWeights(series, [5]);
    expect(weights[0]).toBe(12);
  });

  test('the window at ply 0 does not read before the start of the series', () => {
    const series = [50, 60, 70, 80, 90, 100, 90, 80, 70, 60, 50];
    // Should not throw and should produce a finite, clamped weight.
    const weights = volatilityWeights(series, [0]);
    expect(weights[0]).toBeGreaterThanOrEqual(0.5);
    expect(weights[0]).toBeLessThanOrEqual(12);
  });

  test('the window at the final ply does not read past the end of the series', () => {
    const series = [50, 60, 70, 80, 90, 100, 90, 80, 70, 60, 50];
    const lastPly = series.length - 1;
    const weights = volatilityWeights(series, [lastPly]);
    expect(weights[0]).toBeGreaterThanOrEqual(0.5);
    expect(weights[0]).toBeLessThanOrEqual(12);
  });
});

describe('aggregateAccuracy', () => {
  test('returns null for zero moves', () => {
    expect(aggregateAccuracy([], [])).toBeNull();
  });

  test('returns the single move\'s own accuracy for one move', () => {
    expect(aggregateAccuracy([87.34], [4])).toBe(87.3);
  });

  test('a single blunder among clean moves drags the aggregate down much further than a plain average would', () => {
    const accs = [100, 100, 100, 0];
    const weights = [1, 1, 1, 1];
    const plainAverage = 75;
    const result = aggregateAccuracy(accs, weights);
    expect(result).not.toBeNull();
    expect(result as number).toBeLessThan(plainAverage - 30);
  });

  test('matches the hand-computed weighted/harmonic blend for equal weights', () => {
    const accs = [100, 100, 100, 0];
    const weights = [1, 1, 1, 1];
    // weightedMean = 300/4 = 75; harmonicMean = 4 / (0.03 + 1000) ≈ 0.004
    expect(aggregateAccuracy(accs, weights)).toBeCloseTo(37.5, 1);
  });

  test('clamps to the 0-100 range', () => {
    const result = aggregateAccuracy([0, 0], [1, 1]);
    expect(result).toBe(0);
  });
});

describe('accuracyForAggregate', () => {
  test('a book move with a small real drop counts as 100%', () => {
    expect(accuracyForAggregate('book', 3)).toBeCloseTo(100, 0);
  });

  test('a book move with a real drop of at least 10 win% uses the real drop instead', () => {
    expect(accuracyForAggregate('book', 15)).toBeCloseTo(moveAccuracy(15), 5);
    expect(accuracyForAggregate('book', 15)).toBeLessThan(100);
  });

  test('a non-book move always uses its own drop, never the 100% override', () => {
    expect(accuracyForAggregate('good', 3)).toBeCloseTo(moveAccuracy(3), 5);
  });

  test('a forced move is included with its own computed drop, not excluded or overridden', () => {
    expect(accuracyForAggregate('forced', 0)).toBeCloseTo(moveAccuracy(0), 5);
  });

  test('a miss-labeled move uses its raw drop like any other quality — no miss-specific penalty', () => {
    // §5.9: `miss` is a re-label of an underlying severity for display only;
    // the accuracy math must never special-case it the way it special-cases `book`.
    expect(accuracyForAggregate('miss', 22)).toBeCloseTo(moveAccuracy(22), 5);
    expect(accuracyForAggregate('miss', 22)).toBe(accuracyForAggregate('mistake', 22));
  });
});
