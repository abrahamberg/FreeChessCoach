import type { Move, PieceSymbol } from 'chess.js';
import { CONFIG } from '../config.js';
import { type FastBoard, indexOf, symbolOf } from '../fast-board/board.js';
import { legalMoves } from '../fast-board/moves.js';
import { BISHOP_KNIGHT_GAP_CP, SEE_PIECE_VALUES, seeOnBoard } from '../see.js';

const { minThreatSeeCp: MIN_WON_SEE_CP } = CONFIG.evalWitness;

/** What threatening `capture` (the mover's, were it its turn again) nets:
 * the piece it takes, for nothing or for the capturer taken back (Bxb6 Qxb6
 * against a rook the queen defends: the rook for a bishop). Null when it is
 * no threat to win material: the capture mates (the mate threat says that),
 * the exchange runs longer than one recapture, or the threatened side takes
 * the capturer first. Both boards are given back. */
export function threatNet(after: FastBoard, again: FastBoard, capture: Move): { givesBack: PieceSymbol | null } | null {
  if (capture.san.endsWith('#') || capturerTakenFirst(after, capture)) return null;
  const value = SEE_PIECE_VALUES[capture.captured ?? 'p'];
  const net = seeOnBoard(again, indexOf(capture.to));
  // A bishop against a knight is no material: the gap between them is no loss.
  if (net >= value - BISHOP_KNIGHT_GAP_CP) return { givesBack: null };
  return Math.abs(net - (value - SEE_PIECE_VALUES[capture.piece])) <= BISHOP_KNIGHT_GAP_CP ? { givesBack: capture.piece } : null;
}

/** The threatened side, to move, answers by taking the capturer: it hangs
 * (the knight that would take is taken), or the threatened man takes it at
 * no loss (2.d4 cxd4 Qxd4 against the pawn on c5, queen takes queen). */
function capturerTakenFirst(after: FastBoard, capture: Move): boolean {
  const from = indexOf(capture.from);
  if (seeOnBoard(after, from) >= MIN_WON_SEE_CP) return true;
  const trade = legalMoves(after, indexOf(capture.to)).find((move) => move.to === from);
  if (!trade) return false;
  after.make(trade);
  const back = seeOnBoard(after, from);
  after.unmake();
  return SEE_PIECE_VALUES[symbolOf(trade.captured)] - Math.max(0, back) >= 0;
}
