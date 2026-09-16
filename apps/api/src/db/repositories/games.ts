import type { Kysely } from 'kysely';
import type { GameSpeed, PgnMoveComment } from '@freechesscoach/chess-analysis';
import {
  defaultReviewTierForSource,
  ImportableGameSourceSchema,
  type AnalysisStatus,
  type BotConfig,
  type GameReviewTier,
  type GameSource,
  type PlayerColor
} from '@freechesscoach/shared';
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
  whiteElo: number | null;
  blackElo: number | null;
  ratingsProvisional: boolean;
  rated: boolean | null;
  termination: string | null;
  variant: string | null;
  speed: GameSpeed | null;
  playedAtTime: string | null;
  moveTimes: PgnMoveComment[] | null;
  reviewTier: GameReviewTier;
  annotatedPgn: string | null;
  lastMoveAt: Date | null;
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
  /** 0023_game_metadata.ts — all optional (→ null/false/null) so the many
   * existing non-import call sites (play/bot games) don't need updating for
   * facts only an imported PGN ever carries. */
  whiteElo?: number | null;
  blackElo?: number | null;
  ratingsProvisional?: boolean;
  rated?: boolean | null;
  termination?: string | null;
  variant?: string | null;
  speed?: GameSpeed | null;
  playedAtTime?: string | null;
  moveTimes?: PgnMoveComment[] | null;
  /** Which Games page tab this game starts in — omitted for every existing
   * call site, which lets defaultReviewTierForSource(source) below decide
   * (vs_bot -> bot, coach_play -> coach, everything importable -> imported). */
  reviewTier?: GameReviewTier;
}

export function insert(db: Kysely<Database>, values: NewGame): Promise<GameRow> {
  const botConfigSnapshot = values.botConfigSnapshot ?? null;
  const moveTimes = values.moveTimes ?? null;
  return db
    .insertInto('games')
    .values({
      ...values,
      reviewTier: values.reviewTier ?? defaultReviewTierForSource(values.source),
      botId: values.botId ?? null,
      botConfigSnapshot: botConfigSnapshot === null ? null : JSON.stringify(botConfigSnapshot),
      clockInitialMs: values.clockInitialMs ?? null,
      clockIncrementMs: values.clockIncrementMs ?? null,
      whiteRemainingMs: values.whiteRemainingMs ?? null,
      blackRemainingMs: values.blackRemainingMs ?? null,
      whiteElo: values.whiteElo ?? null,
      blackElo: values.blackElo ?? null,
      ratingsProvisional: values.ratingsProvisional ?? false,
      rated: values.rated ?? null,
      termination: values.termination ?? null,
      variant: values.variant ?? null,
      speed: values.speed ?? null,
      playedAtTime: values.playedAtTime ?? null,
      moveTimes: moveTimes === null ? null : JSON.stringify(moveTimes),
      annotatedPgn: null,
      lastMoveAt: null
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

/** Writes the canonical per-move analysis store (0032_annotated_pgn.ts) —
 * the batch analysis job (whole game, once) and live play's per-move commit/
 * undo path (services/play-moves.ts) both call this instead of the old
 * gameMoveQualitiesRepo insert/delete or analysesRepo.storeClassifiedMoves.
 * `lastMoveAt` is optional so the batch job (which has no "elapsed time
 * since last move" concept) can leave it untouched. */
export function updateAnnotatedPgn(
  db: Kysely<Database>,
  id: string,
  annotatedPgn: string,
  lastMoveAt?: Date
): Promise<void> {
  return db
    .updateTable('games')
    .set({ annotatedPgn, ...(lastMoveAt ? { lastMoveAt } : {}) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** POST /api/games/:id/promote — the games service validates the transition
 * (canPromoteGameReviewTier) before calling this; this function just writes
 * whatever tier it's given. */
export function updateReviewTier(db: Kysely<Database>, id: string, reviewTier: GameReviewTier): Promise<void> {
  return db.updateTable('games').set({ reviewTier }).where('id', '=', id).execute().then(() => undefined);
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

/** Exactly what `services/games.ts`'s `toListItem` (the Games-page list
 * response) reads off a row — deliberately narrower than `GameRow`. That
 * page renders metadata only, never move text, so `listByUserWithStatus`
 * below skips `pgn`/`annotatedPgn`/`moveTimes`/`botConfigSnapshot` (0032_
 * annotated_pgn.ts's "don't load large per-game payloads into memory for a
 * view that doesn't render them" pass) — pulling every game's full text for
 * every list-page load doesn't scale with library size. Callers that need
 * the full row (a game's own detail page, the diagnostics/stats jobs) use
 * `listByUser`/`findByIdForUser` instead. */
export interface GameListRow {
  id: string;
  source: GameSource;
  userColor: PlayerColor;
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  timeControl: string | null;
  playedAt: Date | null;
  createdAt: Date;
  botId: string | null;
  reviewTier: GameReviewTier;
  analysisStatus: AnalysisStatus | null;
}

/** design.md §4.1: Games (home) list — each row needs its analysis status
 * for the status chip, so this left-joins the latest analysis per game. */
export function listByUserWithStatus(db: Kysely<Database>, userId: string): Promise<GameListRow[]> {
  return db
    .selectFrom('games')
    .leftJoin('analyses', 'analyses.gameId', 'games.id')
    .select([
      'games.id',
      'games.source',
      'games.userColor',
      'games.whiteName',
      'games.blackName',
      'games.result',
      'games.timeControl',
      'games.playedAt',
      'games.createdAt',
      'games.botId',
      'games.reviewTier',
      'analyses.status as analysisStatus'
    ])
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

/** game-import.ts's dedup guard: the PGN text a user already imported (from
 * any source — paste, upload, Lichess, or Chess.com) carries its own
 * headers (Site/Date/Round/players), so an exact match against another
 * import is, in practice, always the same real game, not a coincidence.
 * Re-selecting an already-imported game from the Lichess/Chess.com picker —
 * which has no memory of what's already in the library — would otherwise
 * insert a second row that starts back at the bottom of the review-tier
 * stack, making an already-promoted game look like it "reverted" to
 * Imported when really a duplicate just appeared alongside it.
 *
 * Scoped to `ImportableGameSourceSchema`'s sources on purpose: `coach_play`/
 * `vs_bot` rows carry a mutable, headerless PGN that grows move by move
 * (see games.ts's `updatePgn` doc comment), so without this filter an
 * in-progress live game whose current PGN briefly coincides with a pasted
 * one could get matched here and handed back as if it were an already-
 * imported duplicate.
 */
export function findByUserAndPgn(db: Kysely<Database>, userId: string, pgn: string): Promise<GameRow | undefined> {
  return db
    .selectFrom('games')
    .selectAll()
    .where('userId', '=', userId)
    .where('pgn', '=', pgn)
    .where('source', 'in', ImportableGameSourceSchema.options)
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

/** backfill-game-metadata.ts's cursor: `move_times IS NULL` is the "never
 * touched by 0023_game_metadata.ts's write path" marker — both `insert`
 * above and `updateMetadata` below always write a (possibly empty) array,
 * never null, precisely so a pre-migration row stays distinguishable from
 * one already backfilled that simply had no PGN clock data. Ordered by `id`
 * (keyset pagination) so a crash mid-run resumes correctly. */
export function findBatchMissingMoveTimes(db: Kysely<Database>, afterId: string | null, limit: number): Promise<GameRow[]> {
  let query = db.selectFrom('games').selectAll().where('moveTimes', 'is', null).orderBy('id').limit(limit);
  if (afterId !== null) query = query.where('id', '>', afterId);
  return query.execute();
}

export interface GameMetadataUpdate {
  whiteElo: number | null;
  blackElo: number | null;
  ratingsProvisional: boolean;
  rated: boolean | null;
  termination: string | null;
  variant: string | null;
  speed: GameSpeed | null;
  playedAtTime: string | null;
  /** Always an array, never null — see findBatchMissingMoveTimes's doc
   * comment for why null is reserved for "not yet processed". */
  moveTimes: PgnMoveComment[];
}

export function updateMetadata(db: Kysely<Database>, id: string, values: GameMetadataUpdate): Promise<void> {
  return db
    .updateTable('games')
    .set({ ...values, moveTimes: JSON.stringify(values.moveTimes) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}
