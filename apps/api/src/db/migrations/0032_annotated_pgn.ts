import { sql, type Kysely } from 'kysely';

/**
 * Consolidates per-move analysis storage into one annotated PGN per game
 * (see `packages/chess-analysis/src/annotated-pgn.ts`), replacing three
 * places that duplicated or never-read the same data:
 *
 * - `game_move_qualities` — one row per ply, but only for live play
 *   (coach_play/vs_bot); every move of every live game, by every user,
 *   forever, was a row. Dropped outright: the live-play write path
 *   (services/play-moves.ts) now appends each move's analysis straight into
 *   `games.annotated_pgn` instead of inserting a row.
 * - `analyses.classified_moves` — confirmed duplicate of
 *   `analyses.game_report.moves` (both are the same `ClassifiedMoveDto[]`
 *   for the batch pipeline). Dropped; `analyses.game_report` now stores
 *   `StoredGameReport` (moves omitted, packages/shared's
 *   `StoredGameReportSchema`) and a full `GameReport` is composed at read
 *   time from that plus `annotated_pgn`.
 * - `analyses.engine_evals` — write-only: written per chunk during
 *   `engine_running`, read back only via `jsonb_array_length(engine_evals)`
 *   for the progress bar, never for its content once a game reaches
 *   `ready`. Replaced by a plain counter, `evals_computed`.
 *
 * `diagnostic_observations.detail` is the fourth: a per-observation
 * snapshot its own migration (0025) already called "never queried on" — a
 * copy of context now derivable on demand from `(game_id, ply)` by decoding
 * that game's `annotated_pgn`, which is the point of keying evidence that
 * way in the first place.
 *
 * No backfill: per the confirmed product decision, there is no
 * pre-migration analyzed-game data worth preserving. A game analyzed before
 * this migration simply shows `annotated_pgn`/`game_report` as null/stale
 * until it's re-analyzed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games ADD COLUMN annotated_pgn text`.execute(db);
  // The one thing game_move_qualities.created_at was read for
  // (bot-move-commit.ts's elapsed-time calc) — now a column on games
  // itself, updated alongside annotated_pgn on every committed move, so
  // that read no longer needs a second table at all.
  await sql`ALTER TABLE games ADD COLUMN last_move_at timestamptz`.execute(db);

  await sql`ALTER TABLE analyses ADD COLUMN evals_computed int NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE analyses DROP COLUMN engine_evals`.execute(db);
  await sql`ALTER TABLE analyses DROP COLUMN classified_moves`.execute(db);

  await sql`ALTER TABLE diagnostic_observations DROP COLUMN detail`.execute(db);

  await sql`DROP TABLE game_move_qualities`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE game_move_qualities (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id         uuid NOT NULL REFERENCES games(id),
      ply             int NOT NULL,
      move_san        text NOT NULL,
      mover           text NOT NULL CHECK (mover IN ('white','black')),
      quality         text NOT NULL,
      cp_loss         int NOT NULL,
      best_line_san   jsonb NOT NULL,
      eval_after_cp   int NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      reasons         jsonb NOT NULL DEFAULT '[]',
      diagnosis_codes jsonb NOT NULL DEFAULT '[]',
      UNIQUE (game_id, ply)
    )
  `.execute(db);

  await sql`ALTER TABLE diagnostic_observations ADD COLUMN detail jsonb`.execute(db);

  await sql`ALTER TABLE analyses ADD COLUMN classified_moves jsonb`.execute(db);
  await sql`ALTER TABLE analyses ADD COLUMN engine_evals jsonb`.execute(db);
  await sql`ALTER TABLE analyses DROP COLUMN evals_computed`.execute(db);

  await sql`ALTER TABLE games DROP COLUMN last_move_at`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN annotated_pgn`.execute(db);
}
