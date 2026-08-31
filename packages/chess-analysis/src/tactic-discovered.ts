import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf } from './attack-map.js';

interface BoardOccupant {
  type: PieceSymbol;
  color: Color;
}

export interface DiscoveredAttackHit {
  /** Square of the piece whose own move stayed put on the board but gained
   * a new line of attack as a side effect (the piece being fed line-of-sight
   * by the mover's actual move). */
  piece: Square;
  pieceType: PieceSymbol;
  /** The newly-attacked enemy square. */
  revealed: Square;
}

/**
 * The piece other than the one that just moved that newly attacks an enemy
 * piece (or the enemy king) as a side effect of the move — i.e. the move
 * vacated (or, for a capture, filled) a square that was blocking that other
 * piece's line. `null` when no such piece exists. A piece's own line opening
 * because it itself moved is excluded by only ever comparing squares whose
 * occupant is unchanged before/after (the moved piece's from/to squares, and
 * both of castling's squares, always fail that check).
 */
export function discoveredAttackDetail(fenBefore: string, moveSan: string, mover: Color): DiscoveredAttackHit | null {
  const before = new Chess(fenBefore);
  const beforeMap = buildAttackMap(before);
  const beforeBoard = boardSnapshot(before);

  const after = new Chess(fenBefore);
  try {
    if (!after.move(moveSan)) return null;
  } catch {
    return null;
  }
  const afterMap = buildAttackMap(after);
  const opponent = opponentOf(mover);

  for (const piece of occupiedSquares(after)) {
    if (piece.color !== mover) continue;
    const before_ = beforeBoard.get(piece.square);
    if (!before_ || before_.type !== piece.type || before_.color !== piece.color) continue;

    const controlledBefore = new Set(beforeMap.controlledBy.get(piece.square) ?? []);
    const controlledAfter = afterMap.controlledBy.get(piece.square) ?? [];
    const revealed = controlledAfter.find((square) => {
      if (controlledBefore.has(square)) return false;
      const occupant = after.get(square);
      return occupant !== undefined && occupant !== null && occupant.color === opponent;
    });
    if (revealed) return { piece: piece.square, pieceType: piece.type, revealed };
  }
  return null;
}

/** Boolean-only convenience for callers (the registry detector) that don't
 * need the specific piece/square — see `discoveredAttackDetail`. */
export function discoveredAttack(fenBefore: string, moveSan: string, mover: Color): boolean {
  return discoveredAttackDetail(fenBefore, moveSan, mover) !== null;
}

function boardSnapshot(chess: Chess): Map<Square, BoardOccupant> {
  const map = new Map<Square, BoardOccupant>();
  for (const piece of occupiedSquares(chess)) map.set(piece.square, { type: piece.type, color: piece.color });
  return map;
}
