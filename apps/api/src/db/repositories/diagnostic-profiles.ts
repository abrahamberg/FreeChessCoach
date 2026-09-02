import type { Kysely } from 'kysely';
import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import type { Database } from '../schema.js';

export interface DiagnosticProfileRow {
  id: string;
  userId: string;
  timeControl: string;
  windowStart: Date;
  windowEnd: Date;
  computedAt: Date;
  profile: DiagnosticProfileEntry[];
}

/** Most recent stored profile for a user/time-control pool (§4.2: pooled by
 * exact time control, never the coarser `speed` column) — both the
 * `get_diagnostic_profile` coach tool (Task 57.2) and the profile rebuild
 * job's own historyStatus diff (Task 56.4) read this. */
export async function latestProfile(
  db: Kysely<Database>,
  userId: string,
  timeControl: string
): Promise<DiagnosticProfileRow | undefined> {
  const row = await db
    .selectFrom('diagnosticProfiles')
    .selectAll()
    .where('userId', '=', userId)
    .where('timeControl', '=', timeControl)
    .orderBy('windowEnd', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row && { ...row, profile: row.profile as DiagnosticProfileEntry[] };
}

/** Upserts on the `UNIQUE (user_id, time_control, window_end)` constraint
 * (0025_diagnostics.ts) — a rebuild for a window that was already computed
 * replaces it rather than accumulating duplicate rows. */
export function upsertProfile(
  db: Kysely<Database>,
  userId: string,
  timeControl: string,
  windowStart: Date,
  windowEnd: Date,
  profile: DiagnosticProfileEntry[]
): Promise<void> {
  const profileJson = JSON.stringify(profile);
  return db
    .insertInto('diagnosticProfiles')
    .values({ userId, timeControl, windowStart, windowEnd, profile: profileJson })
    .onConflict((oc) =>
      oc.columns(['userId', 'timeControl', 'windowEnd']).doUpdateSet({ windowStart, profile: profileJson, computedAt: new Date() })
    )
    .execute()
    .then(() => undefined);
}
