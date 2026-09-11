import { parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import type { GameReport, StoredGameReport } from '@freechesscoach/shared';
import type { GameRow } from '../db/repositories/games.js';

/**
 * Composes the served `GameReport` (`.moves` included) from the stored,
 * moves-less `StoredGameReport` (0032_annotated_pgn.ts's split —
 * `GameReportSchema.moves` was a confirmed duplicate of
 * `games.annotatedPgn`'s own data) plus the game's own `annotatedPgn`,
 * which is the sole source of per-move detail now. Pure: every caller
 * (`routes/games.ts`'s game detail endpoint) already has both the game row
 * and its stored report in hand from its own queries, so this never touches
 * the DB itself — keeps the served wire shape (`GameReportSchema`, moves
 * included) unchanged for `apps/web`/prompts even though storage no longer
 * duplicates it.
 */
export function composeGameReport(stored: StoredGameReport, game: GameRow): GameReport {
  const moves = game.annotatedPgn ? parseAnnotatedPgn(game.annotatedPgn, game.userColor) : [];
  return { ...stored, moves };
}
