import type { EndgameTheme } from '@freechesscoach/shared';
import { Chess } from 'chess.js';

export type { EndgameTheme } from '@freechesscoach/shared';

/**
 * Classifies the material on the board (either side, pawns/kings ignored)
 * into the stats dashboard's endgame-theme buckets (Phase 26): only pawns
 * left → king-and-pawn; queens with no rooks or minors → queen; rooks with
 * no queens or minors → rook-and-pawn; anything else that reached the
 * endgame phase (mixed material) → other.
 */
export function classifyEndgameType(fen: string): EndgameTheme {
  const pieces = new Chess(fen)
    .board()
    .flat()
    .filter((piece) => piece !== null);

  const hasQueen = pieces.some((piece) => piece.type === 'q');
  const hasRook = pieces.some((piece) => piece.type === 'r');
  const hasMinor = pieces.some((piece) => piece.type === 'n' || piece.type === 'b');

  if (!hasQueen && !hasRook && !hasMinor) return 'kingAndPawn';
  if (hasQueen && !hasRook && !hasMinor) return 'queen';
  if (hasRook && !hasQueen && !hasMinor) return 'rookAndPawn';
  return 'other';
}
