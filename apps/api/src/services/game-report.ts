import { buildAnnotatedPgn, parseAnnotatedPgn, toAnnotatedMoveData } from '@freechesscoach/chess-analysis';
import type { GameReport, PlayerColor, StoredGameReport } from '@freechesscoach/shared';

/** The two fields `composeGameReport` actually needs — deliberately not
 * `GameRow`, so a caller with only those two columns in hand (e.g. the
 * stats dashboard's `StatsSourceRow`, which doesn't otherwise fetch a full
 * game row) can compose too without a wider join or a second query. */
export interface ComposeGameReportSource {
  annotatedPgn: string | null;
  userColor: PlayerColor;
}

/**
 * Composes the served `GameReport` (`.moves` included) from the stored,
 * moves-less `StoredGameReport` (0032_annotated_pgn.ts's split —
 * `GameReportSchema.moves` was a confirmed duplicate of
 * `games.annotatedPgn`'s own data) plus the game's own `annotatedPgn`,
 * which is the sole source of per-move detail now. Pure: every caller
 * already has both the stored report and the two source fields in hand
 * from its own queries, so this never touches the DB itself — keeps the
 * served/consumed shape (`GameReportSchema`, moves included) unchanged for
 * `apps/web`/prompts/the stats aggregators even though storage no longer
 * duplicates it.
 */
export function composeGameReport(stored: StoredGameReport, source: ComposeGameReportSource): GameReport {
  const moves = source.annotatedPgn ? parseAnnotatedPgn(source.annotatedPgn, source.userColor) : [];
  return { ...stored, moves };
}

/**
 * The write side of `composeGameReport`, and deliberately its neighbour: the
 * two are one contract — whatever this function annotates is exactly what
 * that one reads back as the served report's `moves`, since
 * `storeGameReport` drops them.
 *
 * Takes the whole `GameReport` rather than a `ClassifiedMoveDto[]` so a
 * caller cannot hand it the moves it had *before* `buildGameReport`.
 * `buildGameReport` is where a move gains its `phase`,
 * `isTacticalPosition`, `tacticOpportunity`, `tacticAllowed` and
 * `tactic-card-order.ts`'s ordering of `reasons`, so annotating the
 * pre-report moves silently served a report with none of them — Game Review
 * then showed only the prevention sentence on a move that hung a queen to a
 * pin (`docs/tactics-rework.md` §9).
 *
 * `pgn` is the game's own plain PGN — headers and mainline — not an
 * already-annotated one: `buildAnnotatedPgn` rebuilds every comment from
 * `report.moves` alone.
 */
export function annotatedPgnForReport(pgn: string, report: GameReport): string {
  return buildAnnotatedPgn(pgn, new Map(report.moves.map((move) => [move.ply, toAnnotatedMoveData(move)])));
}
