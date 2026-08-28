import type { Kysely } from 'kysely';
import type { AnalysisStatus, BotConfig, GameSource, PlayerColor } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export interface GameRow {
  id: string;
  userId: string;
  pgn: string;
  source: GameSource;
  userColor: PlayerColor;
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  timeControl: string | null;
  eco: string | null;
  playedAt: Date | null;
  createdAt: Date;
  botId: string | null;
  botConfigSnapshot: BotConfig | null;
  clockInitialMs: number | null;
  clockIncrementMs: number | null;
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
}

export interface NewGame {
  userId: string;
  pgn: string;
  source: GameSource;
  userColor: PlayerColor;
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  timeControl: string | null;
  eco: string | null;
  playedAt: Date | null;
  /** Only ever set together, only for source: 'vs_bot' — every other source
   * omits both and gets null/null (matches the DB check constraint added in
   * 0020_play_bot_mode.ts). Optional (rather than required-and-nullable like
   * the fields above) so the many existing non-bot call sites across the
   * codebase don't all need updating for a pair of fields that's null for
   * every one of them. */
  botId?: string | null;
  botConfigSnapshot?: BotConfig | null;
  /** Only ever set together, only for source: 'vs_bot' games with a chosen
   * time control (0021_bot_game_clock.ts) — omitted (→ null/null/null/null)
   * for every untimed game, which today is every non-bot source plus any
   * bot game started without a timer. */
  clockInitialMs?: number | null;
  clockIncrementMs?: number | null;
  whiteRemainingMs?: number | null;
  blackRemainingMs?: number | null;
}

export function insert(db: Kysely<Database>, values: NewGame): Promise<GameRow> {
  const botConfigSnapshot = values.botConfigSnapshot ?? null;
  return db
    .insertInto('games')
    .values({
      ...values,
      botId: values.botId ?? null,
      botConfigSnapshot: botConfigSnapshot === null ? null : JSON.stringify(botConfigSnapshot),
      clockInitialMs: values.clockInitialMs ?? null,
      clockIncrementMs: values.clockIncrementMs ?? null,
      whiteRemainingMs: values.whiteRemainingMs ?? null,
      blackRemainingMs: values.blackRemainingMs ?? null
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Called after every committed move in a timed play_bot game
 * (bot-move-commit.ts) — a no-op call site guard, not enforced here: an
 * untimed game's remaining-ms columns simply stay null since nothing ever
 * calls this for one. */
export function updateRemainingMs(
  db: Kysely<Database>,
  id: string,
  values: { whiteRemainingMs: number; blackRemainingMs: number }
): Promise<void> {
  return db.updateTable('games').set(values).where('id', '=', id).execute().then(() => undefined);
}

/** The only place `games.pgn` is mutated post-insert — play-mode-only (a
 * `source: 'coach_play'`/`'vs_bot'` game's PGN grows move by move; every
 * other source is an immutable imported PGN). */
export function updatePgn(db: Kysely<Database>, id: string, pgn: string): Promise<void> {
  return db.updateTable('games').set({ pgn }).where('id', '=', id).execute().then(() => undefined);
}

/** Written once, when a live game (coach_play/vs_bot) ends — see
 * game-outcome.ts (packages/chess-analysis) for how the result string
 * ('1-0'/'0-1'/'1/2-1/2') is derived. */
export function updateResult(db: Kysely<Database>, id: string, result: string): Promise<void> {
  return db.updateTable('games').set({ result }).where('id', '=', id).execute().then(() => undefined);
}

export function listByUser(db: Kysely<Database>, userId: string): Promise<GameRow[]> {
  return db
    .selectFrom('games')
    .selectAll()
    .where('userId', '=', userId)
    .orderBy('createdAt', 'desc')
    .execute();
}

export interface GameListRow extends GameRow {
  analysisStatus: AnalysisStatus | null;
}

/** design.md §4.1: Games (home) list — each row needs its analysis status
 * for the status chip, so this left-joins the latest analysis per game. */
export function listByUserWithStatus(db: Kysely<Database>, userId: string): Promise<GameListRow[]> {
  return db
    .selectFrom('games')
    .leftJoin('analyses', 'analyses.gameId', 'games.id')
    .selectAll('games')
    .select('analyses.status as analysisStatus')
    .where('games.userId', '=', userId)
    .orderBy('games.createdAt', 'desc')
    .execute();
}

/** No user scoping — for worker/job code, which runs outside a request context. */
export function findById(db: Kysely<Database>, id: string): Promise<GameRow | undefined> {
  return db.selectFrom('games').selectAll().where('id', '=', id).executeTakeFirst();
}

export function findByIdForUser(
  db: Kysely<Database>,
  id: string,
  userId: string
): Promise<GameRow | undefined> {
  return db
    .selectFrom('games')
    .selectAll()
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
}

/** No user scoping — callers must confirm ownership (e.g. via findByIdForUser)
 * before calling this. */
export function remove(db: Kysely<Database>, id: string): Promise<void> {
  return db.deleteFrom('games').where('id', '=', id).execute().then(() => undefined);
}

export async function countImportsSince(
  db: Kysely<Database>,
  userId: string,
  since: Date
): Promise<number> {
  const result = await db
    .selectFrom('games')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('userId', '=', userId)
    .where('createdAt', '>=', since)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}
