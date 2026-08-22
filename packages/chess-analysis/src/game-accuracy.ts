import type { MoveQuality } from '@chess-coach/shared';
import { moveAccuracy } from './accuracy-curve.js';
import { CONFIG } from './config.js';

const {
  minWindow: MIN_WINDOW,
  maxWindow: MAX_WINDOW,
  windowDivisor: WINDOW_DIVISOR,
  minWeight: MIN_WEIGHT,
  maxWeight: MAX_WEIGHT,
  bookDropOverrideThreshold: BOOK_DROP_OVERRIDE_THRESHOLD
} = CONFIG.gameAccuracy;

/**
 * §4.1 — per-ply volatility weight: the population stdev of a local window
 * of White-POV win% around each of the target colour's plies, clamped so a
 * quiet phase never zeroes out and a single wild swing never dominates.
 */
export function volatilityWeights(winPctSeries: number[], moverPlies: number[]): number[] {
  const lastPly = winPctSeries.length - 1;
  const windowSize = clamp(Math.ceil((lastPly + 1) / WINDOW_DIVISOR), MIN_WINDOW, MAX_WINDOW);

  return moverPlies.map((ply) => {
    const lo = Math.max(0, ply - windowSize + 1);
    const hi = Math.min(lastPly, ply + 1);
    const window = winPctSeries.slice(lo, hi + 1);
    return clamp(populationStdev(window), MIN_WEIGHT, MAX_WEIGHT);
  });
}

/**
 * §4.2-4.3 — the mean of a volatility-weighted mean and a harmonic mean.
 * The harmonic mean is what lets a single near-zero move drag an otherwise
 * clean game's aggregate far below a plain average.
 */
export function aggregateAccuracy(accs: number[], weights: number[]): number | null {
  if (accs.length === 0) return null;
  if (accs.length === 1) return round1(accs[0] ?? 0);

  const weightedMean = sum(accs.map((acc, index) => acc * (weights[index] ?? 0))) / sum(weights);
  const harmonicMean = accs.length / sum(accs.map((acc) => 1 / Math.max(acc, 1e-3)));

  return round1(clamp((weightedMean + harmonicMean) / 2, 0, 100));
}

/**
 * §4.4 — book moves count as 100% accuracy unless the engine says the move
 * actually lost at least 10 win%, in which case the real drop is used.
 */
export function accuracyForAggregate(quality: MoveQuality, drop: number): number {
  const effectiveDrop = quality === 'book' && drop < BOOK_DROP_OVERRIDE_THRESHOLD ? 0 : drop;
  return moveAccuracy(effectiveDrop);
}

function populationStdev(values: number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
