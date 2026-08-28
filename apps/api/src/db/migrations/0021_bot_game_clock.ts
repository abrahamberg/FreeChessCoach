import { sql, type Kysely } from 'kysely';

/**
 * Optional chess clock for play-vs-bot games. `clock_initial_ms`/
 * `clock_increment_ms` freeze the chosen time control at game-start time
 * (like `bot_config_snapshot`); `white_remaining_ms`/`black_remaining_ms`
 * are live, updated after every committed move (commitBotTurn) and read by
 * the "flag fell" claim-timeout endpoint. All four are null together for an
 * untimed game — every existing non-bot game source stays untimed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games ADD COLUMN clock_initial_ms integer NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN clock_increment_ms integer NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN white_remaining_ms integer NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN black_remaining_ms integer NULL`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_clock_columns_check
      CHECK (
        (clock_initial_ms IS NULL) = (clock_increment_ms IS NULL)
        AND (clock_initial_ms IS NULL) = (white_remaining_ms IS NULL)
        AND (clock_initial_ms IS NULL) = (black_remaining_ms IS NULL)
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP CONSTRAINT games_clock_columns_check`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN black_remaining_ms`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN white_remaining_ms`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN clock_increment_ms`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN clock_initial_ms`.execute(db);
}
