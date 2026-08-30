import { buildStatsDashboard, classifyTimeControl, type StatsEntry } from '@freechesscoach/chess-analysis';
import { GameReportSchema, type GameSpeedFilter, type StatsDashboard, type StatsRange } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';
import { resultForColour } from './build-game-report.js';

const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = {
  last7: 7,
  last30: 30,
  last365: 365
};

function sinceFor(range: StatsRange, now: Date): Date | null {
  if (range === 'all') return null;
  const since = new Date(now);
  since.setDate(since.getDate() - RANGE_DAYS[range]);
  return since;
}

/**
 * The historical stats dashboard (Phase 29): resolves the requested
 * range/speed filter, fetches every ready game report in range, and hands
 * the pure `chess-analysis` aggregator pre-resolved `StatsEntry` rows — the
 * DB read and `classifyTimeControl` call stay here so the aggregator itself
 * remains pure/I/O-free (AGENTS rule 5).
 */
export async function getStatsDashboard(
  db: Kysely<Database>,
  userId: string,
  range: StatsRange,
  speedFilter: GameSpeedFilter
): Promise<StatsDashboard> {
  const since = sinceFor(range, new Date());
  const rows = await analysesRepo.listReadyReportsForUser(db, userId, since);

  const entries: StatsEntry[] = rows
    .map((row) => toStatsEntry(row))
    .filter((entry): entry is StatsEntry => entry !== null)
    .filter((entry) => speedFilter === 'all' || entry.speed === speedFilter);

  return buildStatsDashboard(entries);
}

/**
 * `gameReport` is jsonb with no migration (see `game-report.ts`'s own
 * comments on `tacticMotifs`/`strategySubScores`/`endgame`) — a report
 * stored before those fields existed fails `GameReportSchema` and is
 * skipped here rather than crashing the whole dashboard. The user can pick
 * these back up by re-analyzing the game.
 */
function toStatsEntry(row: analysesRepo.StatsSourceRow): StatsEntry | null {
  const parsed = GameReportSchema.safeParse(row.gameReport);
  if (!parsed.success) return null;
  return {
    gameReport: parsed.data,
    result: resultForColour(row.pgnResult, row.userColor),
    userColor: row.userColor,
    playedAt: row.playedAt,
    speed: classifyTimeControl(row.timeControl)
  };
}
