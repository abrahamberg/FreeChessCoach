import type { ScopeTag } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import type { DiagnosticEntry } from './diagnostic-entry.js';

interface RateBucket {
  opportunities: number;
  failures: number;
}

function rateOf(bucket: RateBucket): number {
  return bucket.opportunities === 0 ? 0 : bucket.failures / bucket.opportunities;
}

function bucketize<K>(entries: readonly DiagnosticEntry[], keyOf: (entry: DiagnosticEntry) => K | null): Map<K, RateBucket> {
  const buckets = new Map<K, RateBucket>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (key === null) continue;
    const bucket = buckets.get(key) ?? { opportunities: 0, failures: 0 };
    bucket.opportunities += 1;
    if (entry.failed) bucket.failures += 1;
    buckets.set(key, bucket);
  }
  return buckets;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Splits entries into a `'low'`/`'high'` bucket around their own median —
 * self-normalizing per code rather than needing a global config threshold
 * for "low clock" or "high complexity", which vary by time control and
 * position. `null` when there's no numeric signal to split on. */
function medianSplitBuckets(
  entries: readonly DiagnosticEntry[],
  valueOf: (entry: DiagnosticEntry) => number | null
): Map<'low' | 'high', RateBucket> {
  const values = entries.map(valueOf).filter((value): value is number => value !== null);
  const splitPoint = median(values);
  if (splitPoint === null) return new Map();
  return bucketize(entries, (entry) => {
    const value = valueOf(entry);
    return value === null ? null : value < splitPoint ? 'low' : 'high';
  });
}

/** §III.2: "comparing subgroup rates against the overall rate." Compares
 * each bucket's rate against the *rest* of the sample (not the raw overall
 * rate, which the bucket itself dilutes) so a real outlier bucket isn't
 * masked by its own contribution to the total. */
function isBound<K>(entries: readonly DiagnosticEntry[], buckets: ReadonlyMap<K, RateBucket>): boolean {
  const { scopeMinBucketOpportunities, scopeRateRatioThreshold, scopeMinAbsoluteRateGap } = CONFIG.diagnosticProfile;
  const total = entries.reduce(
    (acc, entry) => ({ opportunities: acc.opportunities + 1, failures: acc.failures + (entry.failed ? 1 : 0) }),
    { opportunities: 0, failures: 0 }
  );

  for (const bucket of buckets.values()) {
    if (bucket.opportunities < scopeMinBucketOpportunities) continue;
    const restOpportunities = total.opportunities - bucket.opportunities;
    const restFailures = total.failures - bucket.failures;
    if (restOpportunities < scopeMinBucketOpportunities) continue;

    const bucketRate = rateOf(bucket);
    const restRate = restFailures / restOpportunities;
    const clearsGap = bucketRate - restRate >= scopeMinAbsoluteRateGap;
    const clearsRatio = restRate === 0 ? bucketRate > 0 : bucketRate / restRate >= scopeRateRatioThreshold;
    if (clearsGap && clearsRatio) return true;
  }
  return false;
}

/** §III.2 session derivation: "Sessions are derived from `played_at` +
 * `played_at_time` gaps" — a new session starts whenever the gap since the
 * previous game's `playedAt` exceeds `CONFIG.diagnosticProfile.sessionGapMs`.
 * Returns each game's 0-indexed session number. */
export function deriveSessions(entries: readonly DiagnosticEntry[]): Map<string, number> {
  const firstPlayedAtByGame = new Map<string, Date>();
  for (const entry of entries) {
    if (!firstPlayedAtByGame.has(entry.gameId)) firstPlayedAtByGame.set(entry.gameId, entry.playedAt);
  }

  const sortedGames = [...firstPlayedAtByGame.entries()].sort((a, b) => a[1].getTime() - b[1].getTime());
  const sessionByGame = new Map<string, number>();
  let sessionIndex = -1;
  let previousTime: number | null = null;

  for (const [gameId, playedAt] of sortedGames) {
    const time = playedAt.getTime();
    if (previousTime === null || time - previousTime > CONFIG.diagnosticProfile.sessionGapMs) sessionIndex += 1;
    sessionByGame.set(gameId, sessionIndex);
    previousTime = time;
  }
  return sessionByGame;
}

/**
 * §III.2 scope tags for one code's own opportunity entries — the seven
 * dimensions the captured data can support (opening, side, game phase,
 * clock, complexity, opponent strength, session); structure/time-control/
 * device/stress-bound have no supporting data in `DiagnosticEntry` and are
 * out of scope here, same "gates the data can support" reasoning as
 * `evaluate-gates.ts`. `'general'` when nothing stands out.
 */
export function detectScopeTags(entries: readonly DiagnosticEntry[]): ScopeTag[] {
  const tags: ScopeTag[] = [];
  const sessions = deriveSessions(entries);

  if (isBound(entries, bucketize(entries, (entry) => entry.opening))) tags.push('opening_bound');
  if (isBound(entries, bucketize(entries, (entry) => entry.userColor))) tags.push('side_color_bound');
  if (isBound(entries, bucketize(entries, (entry) => entry.phase))) tags.push('game_phase_bound');
  if (isBound(entries, medianSplitBuckets(entries, (entry) => entry.clockRemainingMs))) tags.push('clock_bound');
  if (isBound(entries, medianSplitBuckets(entries, (entry) => entry.complexity))) tags.push('complexity_bound');
  if (isBound(entries, medianSplitBuckets(entries, (entry) => entry.opponentRating))) tags.push('opponent_strength_bound');
  if (isBound(entries, bucketize(entries, (entry) => sessions.get(entry.gameId) ?? null))) tags.push('session_bound');

  return tags.length === 0 ? ['general'] : tags;
}
