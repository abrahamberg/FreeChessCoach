import { classifyTimeControl, comparePlayerBaseline, type GameSpeed } from '@freechesscoach/chess-analysis';
import { renderPlayerStats } from '@freechesscoach/prompts';
import { StoredGameReportSchema, type PlayerReport } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { StatsSourceRow } from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';

/**
 * Backs the coach agent's `get_player_stats` tool: how THIS game compares
 * to the student's own record, so the session's goal is chosen from
 * evidence rather than from whatever the game happened to feel like.
 *
 * The baseline is the student's other analyzed games at the same speed
 * (rapid vs rapid, blitz vs blitz) — comparing a bullet game against a
 * classical baseline would be worse than no comparison at all. It falls
 * back to every speed only when this game's own time control is unknown.
 */
const BASELINE_GAME_LIMIT = 20;

export interface PlayerStatsContext {
  userId: string;
  gameId: string;
}

export async function getPlayerStatsText(db: Kysely<Database>, ctx: PlayerStatsContext): Promise<string> {
  const [game, gameReport, rows] = await Promise.all([
    gamesRepo.findById(db, ctx.gameId),
    analysesRepo.findGameReportByGameId(db, ctx.gameId),
    analysesRepo.listReadyReportsForUser(db, ctx.userId, null)
  ]);

  const speed = classifyTimeControl(game?.timeControl ?? null);
  const baseline = baselineReports(rows, ctx.gameId, speed);
  const thisGame = game && gameReport ? (StoredGameReportSchema.safeParse(gameReport).data?.players[game.userColor] ?? null) : null;

  return renderPlayerStats({
    comparison: comparePlayerBaseline(thisGame, baseline),
    baselineLabel: baselineLabel(speed)
  });
}

/** Newest first, capped — a coach planning a session needs the student's
 * current form, not their whole history, and every extra game only moves a
 * mean already computed from twenty. */
function baselineReports(rows: StatsSourceRow[], gameId: string, speed: GameSpeed): PlayerReport[] {
  return rows
    .filter((row) => row.gameId !== gameId)
    .filter((row) => speed === 'unknown' || classifyTimeControl(row.timeControl) === speed)
    .sort((a, b) => playedAtOf(b) - playedAtOf(a))
    .slice(0, BASELINE_GAME_LIMIT)
    .map((row) => StoredGameReportSchema.safeParse(row.gameReport).data?.players[row.userColor])
    .filter((report): report is PlayerReport => report !== undefined);
}

function playedAtOf(row: StatsSourceRow): number {
  return row.playedAt?.getTime() ?? 0;
}

function baselineLabel(speed: GameSpeed): string {
  return speed === 'unknown' ? 'recent analyzed games' : `recent ${speed} games`;
}
