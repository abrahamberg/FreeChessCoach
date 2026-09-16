import { describe, expect, test } from 'vitest';
import { computeBetaBinomial, type GameOpportunities } from './beta-binomial.js';

const RATING_PRIOR: [number, number] = [900, 1300];
const AT_MIDPOINT_RATING = 1100;

function widthOf(interval: readonly [number, number]): number {
  return interval[1] - interval[0];
}

describe('computeBetaBinomial', () => {
  test('4-of-8 confined to one game gives a materially wider interval than 4-of-8 spread over four games', () => {
    const oneGame: GameOpportunities[] = [{ gameId: 'g1', opportunities: 8, failures: 4 }];
    const fourGames: GameOpportunities[] = [
      { gameId: 'g1', opportunities: 2, failures: 1 },
      { gameId: 'g2', opportunities: 2, failures: 1 },
      { gameId: 'g3', opportunities: 2, failures: 1 },
      { gameId: 'g4', opportunities: 2, failures: 1 }
    ];

    const clustered = computeBetaBinomial({ games: oneGame, ratingPrior: RATING_PRIOR, studentRating: AT_MIDPOINT_RATING });
    const spread = computeBetaBinomial({ games: fourGames, ratingPrior: RATING_PRIOR, studentRating: AT_MIDPOINT_RATING });

    expect(widthOf(clustered.credibleInterval)).toBeGreaterThan(widthOf(spread.credibleInterval) * 1.2);
    expect(clustered.overdispersion).toBeGreaterThan(spread.overdispersion);
    expect(clustered.effectiveOpportunities).toBeLessThan(spread.effectiveOpportunities);
  });

  test('zero opportunities returns the prior, not NaN', () => {
    const result = computeBetaBinomial({ games: [], ratingPrior: RATING_PRIOR, studentRating: AT_MIDPOINT_RATING });

    expect(result.effectiveOpportunities).toBe(0);
    expect(result.overdispersion).toBe(0);
    expect(Number.isNaN(result.posteriorMean)).toBe(false);
    expect(result.posteriorMean).toBeCloseTo(0.5, 5);
    expect(Number.isNaN(result.credibleInterval[0])).toBe(false);
    expect(Number.isNaN(result.credibleInterval[1])).toBe(false);
  });

  test('a game with zero opportunities is ignored rather than treated as a cluster of nothing', () => {
    const games: GameOpportunities[] = [
      { gameId: 'g1', opportunities: 0, failures: 0 },
      { gameId: 'g2', opportunities: 4, failures: 2 }
    ];

    const result = computeBetaBinomial({ games, ratingPrior: RATING_PRIOR, studentRating: AT_MIDPOINT_RATING });

    expect(Number.isNaN(result.posteriorMean)).toBe(false);
    expect(result.effectiveOpportunities).toBeGreaterThan(0);
  });

  test('a student well below the rating band gets a higher prior mean than one well above it', () => {
    const below = computeBetaBinomial({ games: [], ratingPrior: RATING_PRIOR, studentRating: 500 });
    const above = computeBetaBinomial({ games: [], ratingPrior: RATING_PRIOR, studentRating: 2000 });

    expect(below.posteriorMean).toBeGreaterThan(above.posteriorMean);
  });

  test('the prior mean is clamped rather than leaving [0, 1] for extreme ratings', () => {
    const farBelow = computeBetaBinomial({ games: [], ratingPrior: RATING_PRIOR, studentRating: -5000 });
    const farAbove = computeBetaBinomial({ games: [], ratingPrior: RATING_PRIOR, studentRating: 50000 });

    expect(farBelow.posteriorMean).toBeLessThanOrEqual(1);
    expect(farBelow.posteriorMean).toBeGreaterThan(0);
    expect(farAbove.posteriorMean).toBeGreaterThanOrEqual(0);
    expect(farAbove.posteriorMean).toBeLessThan(1);
  });

  test('effectiveOpportunities never exceeds the raw opportunity count', () => {
    const games: GameOpportunities[] = [
      { gameId: 'g1', opportunities: 3, failures: 3 },
      { gameId: 'g2', opportunities: 5, failures: 0 },
      { gameId: 'g3', opportunities: 2, failures: 1 }
    ];

    const result = computeBetaBinomial({ games, ratingPrior: RATING_PRIOR, studentRating: AT_MIDPOINT_RATING });

    expect(result.effectiveOpportunities).toBeLessThanOrEqual(10);
    expect(result.effectiveOpportunities).toBeGreaterThan(0);
  });

  test('credibleInterval brackets posteriorMean and stays within [0, 1]', () => {
    const games: GameOpportunities[] = [
      { gameId: 'g1', opportunities: 6, failures: 5 },
      { gameId: 'g2', opportunities: 4, failures: 4 }
    ];

    const result = computeBetaBinomial({ games, ratingPrior: RATING_PRIOR, studentRating: AT_MIDPOINT_RATING });

    expect(result.credibleInterval[0]).toBeLessThanOrEqual(result.posteriorMean);
    expect(result.credibleInterval[1]).toBeGreaterThanOrEqual(result.posteriorMean);
    expect(result.credibleInterval[0]).toBeGreaterThanOrEqual(0);
    expect(result.credibleInterval[1]).toBeLessThanOrEqual(1);
  });
});
