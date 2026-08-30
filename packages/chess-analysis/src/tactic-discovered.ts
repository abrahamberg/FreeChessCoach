import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf } from './attack-map.js';

interface BoardOccupant {
  type: PieceSymbol;
  color: Color;
}

/**
 * True when some piece other than the one that just moved newly attacks an
 * enemy piece (or the enemy king) as a side effect of the move — i.e. the
 * move vacated (or, for a capture, filled) a square that was blocking that
 * other piece's line. A piece's own line opening because it itself moved is
 * excluded by only ever comparing squares whose occupant is unchanged
 * before/after (the moved piece's from/to squares, and both of castling's
 * squares, always fail that check).
 */
export function discoveredAttack(fenBefore: string, moveSan: string, mover: Color): boolean {
  const before = new Chess(fenBefore);
  const beforeMap = buildAttackMap(before);
  const beforeBoard = boardSnapshot(before);

  const after = new Chess(fenBefore);
  try {
    if (!after.move(moveSan)) return false;
  } catch {
    return false;
  }
  const afterMap = buildAttackMap(after);
  const opponent = opponentOf(mover);

  for (const piece of occupiedSquares(after)) {
    if (piece.color !== mover) continue;
    const before_ = beforeBoard.get(piece.square);
    if (!before_ || before_.type !== piece.type || before_.color !== piece.color) continue;

    const controlledBefore = new Set(beforeMap.controlledBy.get(piece.square) ?? []);
    const controlledAfter = afterMap.controlledBy.get(piece.square) ?? [];
    const revealsAttack = controlledAfter.some((square) => {
      if (controlledBefore.has(square)) return false;
      const occupant = after.get(square);
      return occupant !== undefined && occupant !== null && occupant.color === opponent;
    });
    if (revealsAttack) return true;
  }
  return false;
}

function boardSnapshot(chess: Chess): Map<Square, BoardOccupant> {
  const map = new Map<Square, BoardOccupant>();
  for (const piece of occupiedSquares(chess)) map.set(piece.square, { type: piece.type, color: piece.color });
  return map;
}
