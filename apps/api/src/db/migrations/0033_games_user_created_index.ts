import { sql, type Kysely } from 'kysely';

/**
 * `games` had no index beyond its primary key — every `listByUser`/
 * `listByUserWithStatus` call (`WHERE user_id = $1 ORDER BY created_at
 * DESC`, the Games-page list and every diagnostics/stats job that walks a
 * user's games) was a full table scan + sort. Flagged during
 * 0032_annotated_pgn.ts's design as "check via EXPLAIN, add only if
 * missing" but not actually done at the time — this closes that gap.
 * `DESC` matches the query's own `ORDER BY ... DESC` so Postgres can read
 * the index in order instead of sorting after the scan.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX games_user_created ON games(user_id, created_at DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS games_user_created`.execute(db);
}
