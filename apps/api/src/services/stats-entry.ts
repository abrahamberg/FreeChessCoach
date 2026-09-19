import { classifyTimeControl, type StatsEntry } from '@freechesscoach/chess-analysis';
import { StoredGameReportSchema } from '@freechesscoach/shared';
import type { StatsSourceRow } from '../db/repositories/analyses.js';
import { resultForColour } from './build-game-report.js';
import { composeGameReport } from './game-report.js';

/**
 * A stats-dashboard row as the pure aggregators' input, or null when the
 * stored report can't be used.
 *
 * `gameReport` is jsonb with no migration (see `game-report.ts`'s own
 * comments on `tacticMotifs`/`strategySubScores`/`endgame`) — a report
 * stored before those fields existed fails `StoredGameReportSchema` and is
 * skipped here rather than crashing the whole dashboard. The user can pick
 * these back up by re-analyzing the game. `StoredGameReportSchema` (not
 * `GameReportSchema`) since `analyses.game_report` no longer stores `moves`
 * (0032_annotated_pgn.ts) — `composeGameReport` adds `.moves` back from
 * `row.annotatedPgn` (`aggregate-opening-stats.ts`'s `openingMistakeCount`
 * genuinely needs per-move data; the rest of the aggregators don't, but
 * `StatsEntry` is one shared shape for both).
 *
 * Shared by the dashboard read and by `bankGameStats`, so a game is archived
 * exactly as it was being counted.
 */
export function toStatsEntry(row: StatsSourceRow): StatsEntry | null {
  const parsed = StoredGameReportSchema.safeParse(row.gameReport);
  if (!parsed.success) return null;
  return {
    gameReport: composeGameReport(parsed.data, row),
    result: resultForColour(row.pgnResult, row.userColor),
    userColor: row.userColor,
    playedAt: row.playedAt,
    speed: classifyTimeControl(row.timeControl)
  };
}
