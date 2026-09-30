import type { Chess, PieceSymbol, Square } from 'chess.js';
import { pieceValueOrKing } from '../tactics.js';

/** The value of the best piece the moved piece now attacks that is either
 * undefended or worth more than it; 0 when none. */
export function threatens(board: Chess, from: Square, piece: PieceSymbol, color: 'w' | 'b'): number {
  const enemy = color === 'w' ? 'b' : 'w';
  let best = 0;
  for (const row of board.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy || cell.type === 'k') continue;
      if (!board.attackers(cell.square, color).includes(from)) continue;
      const value = pieceValueOrKing(cell.type);
      const defended = board.attackers(cell.square, enemy).length > 0;
      if (!defended || value > pieceValueOrKing(piece)) best = Math.max(best, value);
    }
  }
  return best;
}
