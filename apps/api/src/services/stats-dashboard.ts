import {
  buildStatsDashboard,
  headlineTacticBaselineNote,
  mergeStatsBuckets,
  statsBucketOf,
  type StatsEntry
} from '@freechesscoach/chess-analysis';
import {
  StoredGameReportSchema,
  type PlayerColor,
  type GameSpeedFilter,
  type StatsDashboard,
  type StatsRange,
  type TacticBaselineNoteDto
} from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as statsArchiveRepo from '../db/repositories/stats-archive.js';
import type { Database } from '../db/schema.js';
import { sinceFor } from '../lib/range-since.js';
import { toStatsEntry } from './stats-entry.js';

/**
 * The historical stats dashboard (Phase 29): resolves the requested
 * range/speed filter, fetches every ready game report in range, and hands
 * the pure `chess-analysis` aggregator pre-resolved `StatsEntry` rows — the
 * DB read and `classifyTimeControl` call stay here so the aggregator itself
 * remains pure/I/O-free (AGENTS rule 5).
 *
 * Games the user has since deleted are still counted: each deletion folded
 * the game into `stats_archive_weeks` (`bankGameStats`), and those weeks are
 * merged in here. Archived data is week-granular, so `last7`/`last30` can
 * include a whole archived week that only partly overlaps the range;
 * deletions target the *earliest* games, so that is rare and accepted.
 */
export async function getStatsDashboard(
  db: Kysely<Database>,
  userId: string,
  range: StatsRange,
  speedFilter: GameSpeedFilter
): Promise<StatsDashboard> {
  const since = sinceFor(range, new Date());
  const [rows, archivedWeeks] = await Promise.all([
    analysesRepo.listReadyReportsForUser(db, userId, since),
    statsArchiveRepo.listForUser(db, userId, { since, speed: speedFilter })
  ]);

  const entries: StatsEntry[] = rows
    .map((row) => toStatsEntry(row))
    .filter((entry): entry is StatsEntry => entry !== null)
    .filter((entry) => speedFilter === 'all' || entry.speed === speedFilter);

  return buildStatsDashboard(entries, archivedWeeks);
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
  const parsed = StoredGameReportSchema.safeParse(gameReport);
  if (!parsed.success) return null;

  const [rows, archivedWeeks] = await Promise.all([
    analysesRepo.listReadyReportsForUser(db, userId, null),
    statsArchiveRepo.listForUser(db, userId, { since: null, speed: 'all' })
  ]);
  const others = rows
    .filter((row) => row.gameId !== gameId)
    .map((row) => toStatsEntry(row))
    .filter((entry): entry is StatsEntry => entry !== null);

  // Deleted games still count as history: without the archive, deleting old
  // games would shrink (or erase) the baseline this game is measured against.
  const history = archivedWeeks.reduce((total, week) => mergeStatsBuckets(total, week.bucket), statsBucketOf(others));

  return headlineTacticBaselineNote({
    game: parsed.data.players[userColor].tacticMotifs,
    history: history.tactics,
    historyGames: history.games
  });
}
