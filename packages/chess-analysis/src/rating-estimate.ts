import type { MoveQuality } from '@freechesscoach/shared';
import { CONFIG } from './config.js';

const { ratingMin: RATING_MIN, ratingMax: RATING_MAX, accuracyEloAnchors: ACCURACY_ELO_ANCHORS } = CONFIG.ratingEstimate;

/** §8.2 — piecewise-linear interpolation over the anchor table, flat outside it. */
export function accuracyToElo(accuracy: number): number {
  const first = ACCURACY_ELO_ANCHORS[0];
  const last = ACCURACY_ELO_ANCHORS[ACCURACY_ELO_ANCHORS.length - 1];
  if (!first || !last) throw new Error('accuracy/Elo anchor table is empty');

  if (accuracy <= first[0]) return clamp(first[1], RATING_MIN, RATING_MAX);
  if (accuracy >= last[0]) return clamp(last[1], RATING_MIN, RATING_MAX);

  for (let index = 0; index < ACCURACY_ELO_ANCHORS.length - 1; index += 1) {
    const lower = ACCURACY_ELO_ANCHORS[index];
    const upper = ACCURACY_ELO_ANCHORS[index + 1];
    if (!lower || !upper || accuracy < lower[0] || accuracy > upper[0]) continue;
    const fraction = (accuracy - lower[0]) / (upper[0] - lower[0]);
    return clamp(lower[1] + fraction * (upper[1] - lower[1]), RATING_MIN, RATING_MAX);
  }

  throw new Error(`accuracy ${accuracy} did not fall within any anchor segment`);
}

export interface ErrorRatingCounts {
  inaccuracy: number;
  mistake: number;
  blunder: number;
  miss: number;
}

const {
  inaccuracyWeight: INACCURACY_WEIGHT,
  mistakeWeight: MISTAKE_WEIGHT,
  blunderOrMissWeight: BLUNDER_OR_MISS_WEIGHT,
  errorRatingBase: ERROR_RATING_BASE
} = CONFIG.ratingEstimate;

/** §8.3 — per-100-move error-rate cross-check, so a quiet, error-free game
 * can't game the accuracy-only anchor. */
export function errorRating(counts: ErrorRatingCounts, movesPlayed: number): number {
  const per100 = (count: number): number => (100 * count) / Math.max(movesPlayed, 1);
  const raw =
    ERROR_RATING_BASE -
    INACCURACY_WEIGHT * per100(counts.inaccuracy) -
    MISTAKE_WEIGHT * per100(counts.mistake) -
    BLUNDER_OR_MISS_WEIGHT * per100(counts.blunder + counts.miss);
  return clamp(raw, RATING_MIN, RATING_MAX);
}

const { accuracyRatingWeight: ACCURACY_RATING_WEIGHT, errorRatingWeight: ERROR_RATING_WEIGHT } = CONFIG.ratingEstimate;

/** §8.3 — the raw pre-shrinkage rating, before §8.4-8.6's adjustments. */
export function combinedRawRating(accuracyRating: number, errorRatingValue: number): number {
  return ACCURACY_RATING_WEIGHT * accuracyRating + ERROR_RATING_WEIGHT * errorRatingValue;
}

const {
  complexityDivisor: COMPLEXITY_DIVISOR,
  minComplexity: MIN_COMPLEXITY,
  maxComplexity: MAX_COMPLEXITY
} = CONFIG.ratingEstimate;

/** §8.4 — a game that was never sharp gives inflated accuracy; this scales
 * down the effective sample size for a low-volatility (quiet) game. */
export function complexity(meanVolatility: number): number {
  return clamp(meanVolatility / COMPLEXITY_DIVISOR, MIN_COMPLEXITY, MAX_COMPLEXITY);
}

const { forcedSequenceMinLength: FORCED_SEQUENCE_MIN_LENGTH } = CONFIG.ratingEstimate;

/**
 * §8.6's second guard rail: a forced sequence longer than 8 plies (e.g. a
 * long forced simplification or mate-avoidance) carries no rating signal —
 * the whole run is excluded from `movesPlayed`, not just the plies past 8.
 * Short forced runs (a single only-legal-recapture) are ordinary play and
 * stay counted.
 */
export function movesPlayedExcludingForcedSequences(qualities: readonly MoveQuality[]): number {
  const longForcedPlies = forcedRunLengths(qualities)
    .filter((length) => length > FORCED_SEQUENCE_MIN_LENGTH)
    .reduce((total, length) => total + length, 0);
  return qualities.length - longForcedPlies;
}

function forcedRunLengths(qualities: readonly MoveQuality[]): number[] {
  const runs: number[] = [];
  let current = 0;
  for (const quality of qualities) {
    if (quality === 'forced') {
      current += 1;
      continue;
    }
    if (current > 0) runs.push(current);
    current = 0;
  }
  if (current > 0) runs.push(current);
  return runs;
}

const {
  shrinkK: SHRINK_K,
  minMovesPlayed: MIN_MOVES_PLAYED,
  defaultPrior: DEFAULT_PRIOR,
  priorCapMargin: PRIOR_CAP_MARGIN,
  stdErrBase: STD_ERR_BASE,
  stdErrNEffDivisor: STD_ERR_NEFF_DIVISOR,
  roundToNearest: ROUND_TO_NEAREST
} = CONFIG.ratingEstimate;

export interface RatingEstimateInput {
  raw: number;
  complexity: number;
  /** Already reduced by `movesPlayedExcludingForcedSequences` if applicable. */
  movesPlayed: number;
  /** The player's known rating, or `null` to fall back to 1200. */
  prior: number | null;
}

export interface RatingEstimateResult {
  value: number | null;
  range: [number, number] | null;
  reason?: 'insufficient moves';
}

/**
 * §8.5's shrink-toward-prior estimate plus §8.6's prior+600 cap — a single
 * game's rating signal is weak, so it's pulled toward the player's known (or
 * default) rating in proportion to how little of it there was.
 */
export function estimateRating(input: RatingEstimateInput): RatingEstimateResult {
  if (input.movesPlayed < MIN_MOVES_PLAYED) {
    return { value: null, range: null, reason: 'insufficient moves' };
  }

  const prior = input.prior ?? DEFAULT_PRIOR;
  const nEff = input.movesPlayed * input.complexity;
  const shrunk = (nEff * input.raw + SHRINK_K * prior) / (nEff + SHRINK_K);
  const capped = Math.min(shrunk, prior + PRIOR_CAP_MARGIN);
  const stdErr = STD_ERR_BASE / Math.sqrt(Math.max(nEff, 1) / STD_ERR_NEFF_DIVISOR);

  return {
    value: roundToNearest(capped),
    range: [roundToNearest(capped - stdErr), roundToNearest(capped + stdErr)]
  };
}

function roundToNearest(value: number): number {
  return Math.round(value / ROUND_TO_NEAREST) * ROUND_TO_NEAREST;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
