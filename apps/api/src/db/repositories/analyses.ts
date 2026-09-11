import { sql, type Kysely } from 'kysely';
import {
  ImportableGameSourceSchema,
  type AnalysisStatus,
  type BookReport,
  type CoachingPlan,
  type GameReport,
  type PlayerColor,
  type StoredGameReport
} from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export interface AnalysisRow {
  id: string;
  gameId: string;
  status: AnalysisStatus;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

const BASE_COLUMNS = ['id', 'gameId', 'status', 'error', 'createdAt', 'completedAt'] as const;

/** Shared with the active-analyses SSE route (registerAnalysesRoutes) so both
 * ends of "is this analysis still running" agree on the same two statuses. */
export const TERMINAL_ANALYSIS_STATUSES = new Set<AnalysisStatus>(['ready', 'failed']);

export function insertQueued(db: Kysely<Database>, gameId: string): Promise<AnalysisRow> {
  return db
    .insertInto('analyses')
    .values({ gameId, status: 'queued' })
    .returning(BASE_COLUMNS)
    .executeTakeFirstOrThrow();
}

export function findByGameId(
  db: Kysely<Database>,
  gameId: string
): Promise<AnalysisRow | undefined> {
  return db
    .selectFrom('analyses')
    .select(BASE_COLUMNS)
    .where('gameId', '=', gameId)
    .executeTakeFirst();
}

export function findById(db: Kysely<Database>, id: string): Promise<AnalysisRow | undefined> {
  return db.selectFrom('analyses').select(BASE_COLUMNS).where('id', '=', id).executeTakeFirst();
}

export interface AnalysisProgressRow {
  status: AnalysisStatus;
  /** Positions analyzed so far — services/analysis.ts increments this a
   * chunk at a time, so it climbs through the `engine_running` step. */
  progress: number;
}

/** For the status SSE, which re-reads this row every second while a game
 * analyzes. */
export async function findProgress(
  db: Kysely<Database>,
  id: string
): Promise<AnalysisProgressRow | undefined> {
  return db
    .selectFrom('analyses')
    .select(['status', 'evalsComputed as progress'])
    .where('id', '=', id)
    .executeTakeFirst();
}

/** Scoped by game ownership — for the status route, which runs in a request context. */
export function findByIdForUser(
  db: Kysely<Database>,
  id: string,
  userId: string
): Promise<AnalysisRow | undefined> {
  return db
    .selectFrom('analyses')
    .innerJoin('games', 'games.id', 'analyses.gameId')
    .select([
      'analyses.id',
      'analyses.gameId',
      'analyses.status',
      'analyses.error',
      'analyses.createdAt',
      'analyses.completedAt'
    ])
    .where('analyses.id', '=', id)
    .where('games.userId', '=', userId)
    .executeTakeFirst();
}

export function updateStatus(
  db: Kysely<Database>,
  id: string,
  status: AnalysisStatus
): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ status })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Replaces `storeEngineEvals` (0032_annotated_pgn.ts): the batch job calls
 * this once per analyzed chunk instead of persisting the whole growing evals
 * array, which nothing ever read back once a game reached `ready`. */
export function incrementEvalsComputed(db: Kysely<Database>, id: string, by: number): Promise<void> {
  return db
    .updateTable('analyses')
    .set((eb) => ({ evalsComputed: eb('evalsComputed', '+', by) }))
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

export function storeBookReport(
  db: Kysely<Database>,
  id: string,
  report: BookReport
): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ bookReport: JSON.stringify(report) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Stores the report with `moves` omitted (0032_annotated_pgn.ts) — `moves`
 * was a confirmed duplicate of `games.annotatedPgn`'s own data. Callers pass
 * a full `GameReport`; this strips `moves` before persisting rather than
 * pushing that onto every call site. */
export function storeGameReport(
  db: Kysely<Database>,
  id: string,
  report: GameReport
): Promise<void> {
  const { moves: _moves, ...stored } = report;
  return db
    .updateTable('analyses')
    .set({ gameReport: JSON.stringify(stored) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Reads back the stored (moves-less) report — `services/game-report.ts`'s
 * `getFullGameReport` is what composes this with `games.annotatedPgn` into
 * a full `GameReport` for callers that need per-move detail. */
export function findGameReportByGameId(
  db: Kysely<Database>,
  gameId: string
): Promise<StoredGameReport | undefined> {
  return db
    .selectFrom('analyses')
    .select('gameReport')
    .where('gameId', '=', gameId)
    .executeTakeFirst()
    .then((row) => row?.gameReport as StoredGameReport | undefined);
}

export function markReady(
  db: Kysely<Database>,
  id: string,
  coachingPlan: CoachingPlan
): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ status: 'ready', coachingPlan: JSON.stringify(coachingPlan), completedAt: new Date() })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Reads back the stored coaching plan for a ready analysis (coach system prompt). */
export function findCoachingPlanByGameId(
  db: Kysely<Database>,
  gameId: string
): Promise<CoachingPlan | undefined> {
  return db
    .selectFrom('analyses')
    .select('coachingPlan')
    .where('gameId', '=', gameId)
    .executeTakeFirst()
    .then((row) => row?.coachingPlan as CoachingPlan | undefined);
}

export interface ActiveAnalysisRow {
  id: string;
  gameId: string;
  status: AnalysisStatus;
  /** Positions analyzed so far — same definition as AnalysisProgressRow. */
  progress: number;
  pgn: string;
}

/** Every non-terminal analysis belonging to `userId`, oldest first — for the
 * global "engine is working" indicator (GET /api/analyses/active), which has
 * no analysisId to key off yet and needs to discover one on its own. Carries
 * `pgn` so the route can derive each game's total ply count (positionCountOf)
 * without a second round trip. */
export async function findActiveForUser(db: Kysely<Database>, userId: string): Promise<ActiveAnalysisRow[]> {
  const result = await sql<ActiveAnalysisRow>`
    select analyses.id, analyses.game_id as "gameId", analyses.status,
           analyses.evals_computed as progress,
           games.pgn
    from analyses
    join games on games.id = analyses.game_id
    where games.user_id = ${userId}
      and analyses.status not in ('ready', 'failed')
    order by analyses.created_at asc
  `.execute(db);
  return result.rows;
}

export function deleteByGameId(db: Kysely<Database>, gameId: string): Promise<void> {
  return db.deleteFrom('analyses').where('gameId', '=', gameId).execute().then(() => undefined);
}

export function markFailed(db: Kysely<Database>, id: string, error: string): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ status: 'failed', error, completedAt: new Date() })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

export interface StatsSourceRow {
  /** Which game this report is for — lets a caller compare one game against
   * the player's *other* games without re-querying (see
   * `getGameTacticBaselineNote`). */
  gameId: string;
  /** Moves-less, as actually stored (0032_annotated_pgn.ts). Some
   * aggregators (`aggregate-opening-stats.ts`'s `openingMistakeCount`)
   * genuinely need per-move data, not just the aggregate fields — callers
   * that do compose the full report via `services/game-report.ts`'s
   * `composeGameReport(gameReport, { annotatedPgn, userColor })`. */
  gameReport: StoredGameReport;
  /** The PGN `Result` header — resolved to a per-colour outcome at the
   * service layer, same as `buildGameReportForAnalysis`'s own resultForColour. */
  pgnResult: string | null;
  userColor: PlayerColor;
  playedAt: Date | null;
  timeControl: string | null;
  annotatedPgn: string | null;
}

/** Feeds the stats dashboard (Phase 29): every ready analysis for one of
 * `userId`'s own imported games, optionally restricted to games played on or
 * after `since` (falls back to `createdAt` when `playedAt` is null, matching
 * `GameRow`'s own `date = game.playedAt ?? game.createdAt` display
 * convention). `coach_play`/`vs_bot` games are excluded — the dashboard is
 * about performance against real opponents, not practice sessions against
 * the coach or a bot — by scoping to `ImportableGameSourceSchema`'s three
 * values rather than hand-duplicating that list here. */
export async function listReadyReportsForUser(
  db: Kysely<Database>,
  userId: string,
  since: Date | null
): Promise<StatsSourceRow[]> {
  let query = db
    .selectFrom('analyses')
    .innerJoin('games', 'games.id', 'analyses.gameId')
    .select([
      'analyses.gameId as gameId',
      'analyses.gameReport as gameReport',
      'games.result as pgnResult',
      'games.userColor as userColor',
      'games.playedAt as playedAt',
      'games.timeControl as timeControl',
      'games.annotatedPgn as annotatedPgn'
    ])
    .where('analyses.status', '=', 'ready')
    .where('games.userId', '=', userId)
    .where('games.source', 'in', ImportableGameSourceSchema.options);

  if (since) {
    query = query.where((eb) =>
      eb.or([eb('games.playedAt', '>=', since), eb.and([eb('games.playedAt', 'is', null), eb('games.createdAt', '>=', since)])])
    );
  }

  const rows = await query.execute();
  return rows.map((row) => ({ ...row, gameReport: row.gameReport as StoredGameReport }));
}
