import { parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
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
