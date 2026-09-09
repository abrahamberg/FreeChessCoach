import { buildStatsDashboard, classifyTimeControl, headlineTacticBaselineNote, type StatsEntry } from '@freechesscoach/chess-analysis';
import {
  GameReportSchema,
  TACTIC_MOTIF_TYPES,
  type GameSpeedFilter,
  type PlayerColor,
  type StatsDashboard,
  type StatsRange,
  type TacticBaselineNoteDto,
  type TacticMotifCounts,
  type TacticMotifType
} from '@freechesscoach/shared';
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

/**
 * The one game-level tactic note worth showing on a game's review: what this
 * game did that is out of line with the player's own record.
 *
 * `docs/tactics-rework.md` §5 layer 5. The comparison is deliberately against
 * the player's *other* games — this game is filtered out of the aggregate
 * before it is summed — so a lopsided game can't flatter itself by helping
 * define the baseline it is measured against.
 *
 * `null` whenever there is nothing to say: too little history, or a game that
 * simply matches the player's usual rates. That is the common case and is not
 * an error.
 */
export async function getGameTacticBaselineNote(
  db: Kysely<Database>,
  userId: string,
  gameId: string,
  gameReport: unknown,
  userColor: PlayerColor
): Promise<TacticBaselineNoteDto | null> {
  const parsed = GameReportSchema.safeParse(gameReport);
  if (!parsed.success) return null;

  const rows = await analysesRepo.listReadyReportsForUser(db, userId, null);
  const others = rows
    .filter((row) => row.gameId !== gameId)
    .map((row) => toStatsEntry(row))
    .filter((entry): entry is StatsEntry => entry !== null);

  return headlineTacticBaselineNote({
    game: parsed.data.players[userColor].tacticMotifs,
    history: sumTacticMotifs(others),
    historyGames: others.length
  });
}

/** The same fold `buildStatsDashboard` does for the dashboard's own tactics
 * section, kept separate here because the baseline needs the sum over a
 * *filtered* set of games rather than the whole dashboard. */
function sumTacticMotifs(entries: StatsEntry[]): TacticMotifCounts {
  const totals = Object.fromEntries(
    TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }] as const)
  ) as Record<TacticMotifType, { opportunities: number; found: number; preventable?: number; prevented?: number }>;

  for (const entry of entries) {
    const motifs = entry.gameReport.players[entry.userColor].tacticMotifs;
    for (const type of TACTIC_MOTIF_TYPES) {
      const row = totals[type];
      row.opportunities += motifs[type].opportunities;
      row.found += motifs[type].found;
      if (motifs[type].preventable !== undefined) row.preventable = (row.preventable ?? 0) + motifs[type].preventable;
      if (motifs[type].prevented !== undefined) row.prevented = (row.prevented ?? 0) + motifs[type].prevented;
    }
  }
  return totals as TacticMotifCounts;
}
