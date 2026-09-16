import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAMES } from './piece-names.js';
import { see } from './see.js';

/**
 * What an ordinary exchange is, said plainly.
 *
 * A recapture is the most common move in chess and the review had no word
 * for one: `4…Nxd4` came back as nothing but "Best move", and `5.Nxd4` — the
 * natural retake — came back as "Costs 8 squares of piece mobility". Both
 * are the same gap. The player knows they took a piece; what a note is worth
 * saying is which exchange this was, and that the material came out level.
 *
 * Only even exchanges get a sentence here. A capture that wins material is
 * the tactic detectors' business, and one that loses it is already the
 * hanging-piece/undefended reasons' business — saying "trades the knight"
 * over either would be describing the shape and missing the point.
 */
export interface TradeDescriptionInput {
  fenBefore: string;
  moveSan: string;
  /** The opponent's previous move captured on this same square — computed
   * for the classifier already (`classify.ts`), so this never re-derives it. */
  isRecapture: boolean;
}

export function describeTrade(input: TradeDescriptionInput): string | null {
  const board = new Chess(input.fenBefore);
  const move = tryMove(board, input.moveSan);
  if (!move?.captured) return null;

  const square = move.to as Square;
  const taken = PIECE_NAMES[move.captured];
  if (input.isRecapture) return `Recaptures the ${taken} on ${square}`;

  // Nobody can take back, so nothing was traded — the move won a piece, lost
  // one, or picked up a loose pawn, and each of those has its own note.
  if (!isEvenExchange(input.fenBefore, square, move.color)) return null;
  if (move.piece === move.captured) return `Trades ${plural(move.piece)} on ${square}`;
  return `Trades the ${PIECE_NAMES[move.piece]} for the ${taken} on ${square}`;
}

/** SEE is already from the capturer's point of view, so an exchange that
 * comes out level is exactly zero — a won or lost one is somebody else's
 * sentence. */
function isEvenExchange(fenBefore: string, square: Square, capturer: Color): boolean {
  return see(fenBefore, square, capturer) === 0;
}

function tryMove(board: Chess, moveSan: string): ReturnType<Chess['move']> | null {
  try {
    return board.move(moveSan);
  } catch {
    return null;
  }
}

function plural(piece: PieceSymbol): string {
  return `${PIECE_NAMES[piece]}s`;
}
