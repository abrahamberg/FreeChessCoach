import { sql, type Kysely } from 'kysely';

/**
 * docs/plan.md Phase 67 — an append-only ledger of *new* successful imports,
 * one row each. The daily/weekly import limits count this table instead of
 * `games`, so deleting a game can never free quota. Deliberately **no foreign
 * key to `games`** (there is no `game_id` at all): nothing about a game's
 * lifecycle may touch these rows. `user_id` does reference `users` — account
 * deletion removes the ledger via `gameImportEventsRepo.deleteByUserId`, the
 * same explicit app-layer cascade every other user-scoped table uses.
 *
 * Backfilled from `games` for the last 7 days (imported sources only) so the
 * limits are continuous across the deploy rather than resetting to zero.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE game_import_events (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX game_import_events_user_created ON game_import_events(user_id, created_at)`.execute(db);
  await sql`
    INSERT INTO game_import_events (user_id, created_at)
    SELECT user_id, created_at FROM games
    WHERE source IN ('paste', 'upload', 'lichess', 'chesscom')
      AND created_at >= now() - interval '7 days'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE game_import_events`.execute(db);
}
