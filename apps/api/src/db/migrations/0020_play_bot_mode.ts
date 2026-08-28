import { sql, type Kysely } from 'kysely';

/**
 * Play-vs-bot mode ("Play vs Bot" plan): a live game against a silent,
 * preset Stockfish-driven bot, reusing games/sessions the same way play mode
 * (0010_play_mode.ts) reused them for the coach. `games.source` gains
 * 'vs_bot'; `bot_id` + `bot_config_snapshot` are set iff source = 'vs_bot' —
 * the snapshot freezes the BOT_ROSTER entry's config at game-start time so a
 * later roster edit never rewrites the story of an already-played game (same
 * reasoning as an immutable imported PGN). `sessions.mode` gains 'play_bot'.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP CONSTRAINT games_source_check`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_source_check
      CHECK (source IN ('paste','upload','lichess','coach_play','vs_bot'))
  `.execute(db);

  await sql`ALTER TABLE games ADD COLUMN bot_id text NULL`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN bot_config_snapshot jsonb NULL`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_bot_columns_check
      CHECK ((source = 'vs_bot') = (bot_id IS NOT NULL AND bot_config_snapshot IS NOT NULL))
  `.execute(db);

  await sql`ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check`.execute(db);
  await sql`
    ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check
      CHECK (mode IN ('analyze','play','play_bot'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check`.execute(db);
  await sql`
    ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check
      CHECK (mode IN ('analyze','play'))
  `.execute(db);

  await sql`ALTER TABLE games DROP CONSTRAINT games_bot_columns_check`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN bot_config_snapshot`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN bot_id`.execute(db);

  await sql`ALTER TABLE games DROP CONSTRAINT games_source_check`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_source_check
      CHECK (source IN ('paste','upload','lichess','coach_play'))
  `.execute(db);
}
