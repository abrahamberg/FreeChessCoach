const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET = 6;

/** The Monday (00:00 UTC) of the week containing `date`, as `YYYY-MM-DD` —
 * the key `stats_archive_weeks` files a game under. UTC on purpose: the
 * bucket a game lands in must not depend on the server's timezone. */
export function isoWeekStart(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (day.getUTCDay() + MONDAY_OFFSET) % DAYS_PER_WEEK;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day.toISOString().slice(0, 10);
}
