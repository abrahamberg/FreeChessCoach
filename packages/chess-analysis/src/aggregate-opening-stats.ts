import type { OpeningStats } from '@freechesscoach/shared';
import { finalizeOpeningStats } from './finalize-stats-dashboard.js';
import { statsBucketOf } from './stats-bucket.js';
import type { StatsEntry } from './stats-entry.js';

export type { OpeningPerformanceRow, OpeningStats } from '@freechesscoach/shared';

/** Cross-game opening breakdown (Task 27.2) — mirrors chess.com's Opening
 * Statistics: average book depth, opening-phase accuracy, mistake rate, and
 * a per-opening performance table. The opening slice of the stats
 * dashboard's reduce/finalize pipeline. */
export function aggregateOpeningStats(entries: StatsEntry[]): OpeningStats {
  return finalizeOpeningStats(statsBucketOf(entries).opening);
}
