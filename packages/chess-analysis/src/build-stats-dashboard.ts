import type { StatsDashboard } from '@freechesscoach/shared';
import { aggregateRatingStats } from './aggregate-rating-stats.js';
import { finalizeStatsDashboard, weeklyRatingPoints } from './finalize-stats-dashboard.js';
import { mergeStatsBuckets } from './merge-stats-buckets.js';
import { emptyStatsBucket, statsBucketOf, type ArchivedStatsWeek } from './stats-bucket.js';
import type { StatsEntry } from './stats-entry.js';

export type { EndgameStandingRow, EndgameStats, EndgameThemeRow, StatsDashboard, StrategyStats } from '@freechesscoach/shared';

/** Cross-game stats dashboard aggregator (Phase 28) — the pure composition
 * root for the chess.com-style Insights page: reduce the live games to a
 * bucket, merge in any archived weeks (games since deleted, docs/plan.md
 * Phase 68), finalize. Every section is null/empty (never a misleading 0)
 * when the games carry no usable signal for it.
 *
 * Live games each plot a rating point; an archived week is one point (its
 * mean estimate) — the per-game detail is what deleting a game gives up. */
export function buildStatsDashboard(entries: StatsEntry[], archivedWeeks: ArchivedStatsWeek[] = []): StatsDashboard {
  const archived = archivedWeeks.reduce((total, week) => mergeStatsBuckets(total, week.bucket), emptyStatsBucket());
  const bucket = mergeStatsBuckets(archived, statsBucketOf(entries));
  const ratingPoints = [...weeklyRatingPoints(archivedWeeks), ...aggregateRatingStats(entries).points];
  return finalizeStatsDashboard(bucket, ratingPoints);
}
