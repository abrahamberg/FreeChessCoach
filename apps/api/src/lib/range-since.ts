import type { StatsRange } from '@freechesscoach/shared';

const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = {
  last7: 7,
  last30: 30,
  last365: 365
};

/** The earliest date a `StatsRange` includes, or null for 'all' — shared by
 * the stats dashboard and the Find games list's time filter so both agree on
 * what "last 30 days" means. */
export function sinceFor(range: StatsRange, now: Date): Date | null {
  if (range === 'all') return null;
  const since = new Date(now);
  since.setDate(since.getDate() - RANGE_DAYS[range]);
  return since;
}
