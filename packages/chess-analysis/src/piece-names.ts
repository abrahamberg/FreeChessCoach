import type { PieceSymbol } from 'chess.js';

/** The one place a piece letter becomes a word a reader sees. Its own file
 * because every layer needs it — the reason builder, the board facts the
 * detectors share, and the detectors themselves — and a shared constant
 * living inside one of those layers is what makes an import cycle out of
 * "name this piece". */
export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
};
