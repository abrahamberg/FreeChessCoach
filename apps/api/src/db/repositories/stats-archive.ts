import { sql, type Kysely } from 'kysely';
import type { GameSpeed } from '@freechesscoach/chess-analysis';
import { StatsBucketSchema, type StatsBucket } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

/** `week_start` is read and written as a `YYYY-MM-DD` string, never a JS
 * `Date`: node-postgres turns a `date` into local-midnight, which shifts the
 * day in any timezone east of UTC. */
export interface ArchivedWeekRow {
  weekStart: string;
  speed: GameSpeed;
  bucket: StatsBucket;
}

const DAYS_PER_WEEK = 7;

/** The stored bucket for one key, row-locked (`FOR UPDATE`) so two deletes in
 * the same week/speed merge one after the other instead of overwriting each
 * other. Call it inside the same transaction as the `upsert` that follows. */
export async function findForUpdate(
  db: Kysely<Database>,
  userId: string,
  weekStart: string,
  speed: GameSpeed
): Promise<StatsBucket | undefined> {
  const row = await db
    .selectFrom('statsArchiveWeeks')
    .select('bucket')
    .where('userId', '=', userId)
    .where(sql<boolean>`week_start = ${weekStart}::date`)
    .where('speed', '=', speed)
    .forUpdate()
    .executeTakeFirst();
  return row && StatsBucketSchema.parse(row.bucket);
}

export async function upsert(
  db: Kysely<Database>,
  values: { userId: string; weekStart: string; speed: GameSpeed; bucket: StatsBucket }
): Promise<void> {
  const bucket = JSON.stringify(StatsBucketSchema.parse(values.bucket));
  await sql`
    INSERT INTO stats_archive_weeks (user_id, week_start, speed, bucket)
    VALUES (${values.userId}, ${values.weekStart}::date, ${values.speed}, ${bucket}::jsonb)
    ON CONFLICT (user_id, week_start, speed)
    DO UPDATE SET bucket = EXCLUDED.bucket, updated_at = now()
  `.execute(db);
}

/** Archived weeks that overlap `since` (a week overlaps if it ends after it:
 * `week_start + 7 days > since`), or every week for `since: null`; only one
 * speed unless `speed` is `'all'`. Oldest first. */
export async function listForUser(
  db: Kysely<Database>,
  userId: string,
  filter: { since: Date | null; speed: GameSpeed | 'all' }
): Promise<ArchivedWeekRow[]> {
  let query = db
    .selectFrom('statsArchiveWeeks')
    .select([sql<string>`week_start::text`.as('weekStart'), 'speed', 'bucket'])
    .where('userId', '=', userId);
  if (filter.since) query = query.where(sql<boolean>`week_start + ${DAYS_PER_WEEK}::int > (${filter.since}::timestamptz AT TIME ZONE 'UTC')::date`);
  if (filter.speed !== 'all') query = query.where('speed', '=', filter.speed);

  const rows = await query.orderBy('weekStart').orderBy('speed').execute();
  return rows.map((row) => ({ weekStart: row.weekStart, speed: row.speed, bucket: StatsBucketSchema.parse(row.bucket) }));
}

/** Account deletion only — the archive is otherwise append-and-merge. */
export async function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  await db.deleteFrom('statsArchiveWeeks').where('userId', '=', userId).execute();
}
