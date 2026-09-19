import { sql, type Kysely } from 'kysely';

/**
 * docs/plan.md Phase 68 — what deleting a game leaves behind of its stats.
 * One row per (user, ISO week, speed), holding a `StatsBucket`
 * (packages/shared/src/stats-bucket.ts): additive sums and counts, so the
 * stats dashboard merges these with the live games' bucket and the numbers do
 * not move when a game is deleted. `week_start` is the Monday (UTC) the week
 * begins on. `speed` is `classifyTimeControl`'s value, so the dashboard's
 * speed filter applies to archived weeks exactly as to live games.
 *
 * `bucket` is jsonb, parsed with `StatsBucketSchema` at every read
 * (stats-archive.ts) — no unvalidated jsonb. No `ON DELETE CASCADE`: like
 * every user-scoped table here, account deletion clears it explicitly
 * (`statsArchiveRepo.deleteByUserId`).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE stats_archive_weeks (
      user_id    uuid NOT NULL REFERENCES users(id),
      week_start date NOT NULL,
      speed      text NOT NULL,
      bucket     jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, week_start, speed)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE stats_archive_weeks`.execute(db);
}
