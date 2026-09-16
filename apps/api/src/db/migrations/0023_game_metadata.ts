import { sql, type Kysely } from 'kysely';

/**
 * docs/diagnose.md §4.2's game-window filtering and gates DQ-03/DQ-08/
 * DQ-12/DQ-13/DQ-15 all need rating/rated/termination/variant/speed/clock
 * facts that game-import.ts never captured. `speed` persists
 * `classifyTimeControl(timeControl)` at import time so pooling-by-speed
 * pushes into SQL instead of being recomputed on every stats read; `pgn`'s
 * `[%clk]` comments (Task 51.1) land on `move_times` since they're a PGN
 * fact, not an analysis-time derivation, so they belong on `games`, not
 * `analyses`.
 *
 * Also widens `games_source_check` for the Task 51.6 chess.com import
 * client — bundled here so a second migration isn't needed just to add one
 * more enum value to the same constraint this migration is already editing.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games ADD COLUMN white_elo integer NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN black_elo integer NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN ratings_provisional boolean NOT NULL DEFAULT false`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN rated boolean NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN termination text NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN variant text NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN speed text NULL`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_speed_check
      CHECK (speed IN ('bullet','blitz','rapid','classical','correspondence','unknown'))
  `.execute(db);
  await sql`ALTER TABLE games ADD COLUMN played_at_time time NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN move_times jsonb NULL`.execute(db);

  await sql`ALTER TABLE games DROP CONSTRAINT games_source_check`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_source_check
      CHECK (source IN ('paste','upload','lichess','coach_play','vs_bot','chesscom'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP CONSTRAINT games_source_check`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_source_check
      CHECK (source IN ('paste','upload','lichess','coach_play','vs_bot'))
  `.execute(db);

  await sql`ALTER TABLE games DROP COLUMN move_times`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN played_at_time`.execute(db);
  await sql`ALTER TABLE games DROP CONSTRAINT games_speed_check`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN speed`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN variant`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN termination`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN rated`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN ratings_provisional`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN black_elo`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN white_elo`.execute(db);
}
