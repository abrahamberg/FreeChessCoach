import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf, toColorName } from './attack-map.js';

export interface RemovesDefenderHit {
  /** Square of the enemy defender the move captured. */
  capturedDefender: Square;
  /** Square of the enemy piece that defender was the sole guard of, now
   * undefended and attacked. */
  exposedTarget: Square;
}

/**
 * Deflection: the move captures an enemy piece that was the *sole* defender
 * of another enemy piece, leaving that second piece undefended and attacked.
 * Only the capture case is handled (not "attacked and forced away without
 * being captured" — verifying a forced retreat generically is a much larger
 * problem than this heuristic is worth solving).
 */
export function removesDefender(fenBefore: string, moveSan: string, mover: Color): RemovesDefenderHit | null {
  const before = new Chess(fenBefore);
  const beforeMap = buildAttackMap(before);
  const opponent = opponentOf(mover);
  const opponentName = toColorName(opponent);

  const after = new Chess(fenBefore);
  let move;
  try {
    move = after.move(moveSan);
  } catch {
    return null;
  }
  if (!move || move.captured === undefined) return null;

  const capturedDefenderSquare = move.to as Square;
  const afterMap = buildAttackMap(after);
  const moverName = toColorName(mover);

  for (const target of occupiedSquares(before)) {
    if (target.color !== opponent || target.square === capturedDefenderSquare) continue;

    const defendersBefore = beforeMap.attackersOf.get(target.square)?.[opponentName] ?? [];
    if (defendersBefore.length !== 1 || defendersBefore[0] !== capturedDefenderSquare) continue;

    const afterOccupant = after.get(target.square);
    if (!afterOccupant || afterOccupant.color !== opponent) continue;

    const defendersAfter = afterMap.attackersOf.get(target.square)?.[opponentName] ?? [];
    const attackersAfter = afterMap.attackersOf.get(target.square)?.[moverName] ?? [];
    if (defendersAfter.length === 0 && attackersAfter.length > 0) {
      return { capturedDefender: capturedDefenderSquare, exposedTarget: target.square };
    }
  }
  return null;
}
