import type { ClassifiedMove } from '@freechesscoach/chess-analysis';
import { sql, type Kysely } from 'kysely';
import {
  ImportableGameSourceSchema,
  type AnalysisStatus,
  type BookReport,
  type CoachingPlan,
  type EngineEval,
  type GameReport,
  type PlayerColor
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
  /** Engine evals persisted so far. services/analysis.ts stores them a chunk
   * at a time, so this climbs through the `engine_running` step. */
  progress: number;
}

/** For the status SSE, which re-reads this row every second while a game
 * analyzes: counts the stored evals in Postgres instead of shipping the whole
 * `engine_evals` document back on each poll just to measure its length.
 * Raw SQL because `engine_evals` isn't on AnalysisRow, and the column is
 * spelled snake_case here since CamelCasePlugin doesn't rewrite sql``. */
export async function findProgress(
  db: Kysely<Database>,
  id: string
): Promise<AnalysisProgressRow | undefined> {
  const result = await sql<AnalysisProgressRow>`
    select status, coalesce(jsonb_array_length(engine_evals), 0)::int as progress
    from analyses
    where id = ${id}
  `.execute(db);
  return result.rows[0];
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

export function storeEngineEvals(
  db: Kysely<Database>,
  id: string,
  evals: EngineEval[]
): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ engineEvals: JSON.stringify(evals) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

export function storeClassifiedMoves(
  db: Kysely<Database>,
  id: string,
  moves: ClassifiedMove[]
): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ classifiedMoves: JSON.stringify(moves) })
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

export function storeGameReport(
  db: Kysely<Database>,
  id: string,
  report: GameReport
): Promise<void> {
  return db
    .updateTable('analyses')
    .set({ gameReport: JSON.stringify(report) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Reads back the assembled game report (game report summary panel). */
export function findGameReportByGameId(
  db: Kysely<Database>,
  gameId: string
): Promise<GameReport | undefined> {
  return db
    .selectFrom('analyses')
    .select('gameReport')
    .where('gameId', '=', gameId)
    .executeTakeFirst()
    .then((row) => row?.gameReport as GameReport | undefined);
}

/** Reads back the stored per-move classification for a ready analysis (move
 * explorer color-coding). */
export function findClassifiedMovesByGameId(
  db: Kysely<Database>,
  gameId: string
): Promise<ClassifiedMove[] | undefined> {
  return db
    .selectFrom('analyses')
    .select('classifiedMoves')
    .where('gameId', '=', gameId)
    .executeTakeFirst()
    .then((row) => row?.classifiedMoves as ClassifiedMove[] | undefined);
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
  /** Engine evals persisted so far — same definition as AnalysisProgressRow. */
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
           coalesce(jsonb_array_length(analyses.engine_evals), 0)::int as progress,
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
  gameReport: GameReport;
  /** The PGN `Result` header — resolved to a per-colour outcome at the
   * service layer, same as `buildGameReportForAnalysis`'s own resultForColour. */
  pgnResult: string | null;
  userColor: PlayerColor;
  playedAt: Date | null;
  timeControl: string | null;
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
      'analyses.gameReport as gameReport',
      'games.result as pgnResult',
      'games.userColor as userColor',
      'games.playedAt as playedAt',
      'games.timeControl as timeControl'
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
  return rows.map((row) => ({ ...row, gameReport: row.gameReport as GameReport }));
}
