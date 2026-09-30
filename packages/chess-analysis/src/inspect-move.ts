import { Chess, type Move, type PieceSymbol } from 'chess.js';
import { toColorName, type ColorName } from './attack-map.js';
import { forks, type Fork } from './board-facts/forks.js';
import { loosePieces, type LoosePiece } from './board-facts/loose-pieces.js';
import { pieceValueOrKing } from './tactics.js';

export interface IllegalMoveInspection {
  requested: string;
  legal: false;
  /** Legal moves the same piece DOES have here — what makes an illegal-move
   * answer useful instead of just a rejection. Empty when nothing on the
   * board matches the requested piece at all. */
  alternatives: string[];
}

export interface ReplayedMove {
  requested: string;
  legal: true;
  /** chess.js's normalized SAN — the spelling the coach should use, which
   * is not always the spelling it asked with. */
  san: string;
  from: string;
  to: string;
  piece: PieceSymbol;
  color: ColorName;
  captured: PieceSymbol | null;
  gives: 'check' | 'checkmate' | null;
  resultFen: string;
  /** The MOVER's own pieces the other side could win after this move (both
   * tiers of `loosePieces`), except the piece that just took something at
   * least as valuable as itself: that capture is a trade, not a loose piece. */
  leavesLoose: LoosePiece[];
  /** Forks the mover has in the resulting position. */
  forks: Fork[];
}

/** One move replayed on its own board: a shared instance would leave the
 * position one move deep for the next request, which is exactly the silent
 * drift `check_moves` exists to prevent. Null when the move is not legal. */
export function replayMove(fen: string, requested: string): ReplayedMove | null {
  const board = new Chess(fen);
  const move = tryMove(board, requested);
  if (!move) return null;
  const resultFen = board.fen();
  const traded = move.captured !== undefined && pieceValueOrKing(move.captured) >= pieceValueOrKing(move.piece);
  return {
    requested,
    legal: true,
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    color: toColorName(move.color),
    captured: move.captured ?? null,
    gives: board.isCheckmate() ? 'checkmate' : board.isCheck() ? 'check' : null,
    resultFen,
    leavesLoose: loosePieces(resultFen, move.color).filter((piece) => !(traded && piece.square === move.to)),
    forks: forks(resultFen, move.color)
  };
}

function tryMove(board: Chess, requested: string): Move | null {
  try {
    return board.move(requested);
  } catch {
    return null;
  }
}
