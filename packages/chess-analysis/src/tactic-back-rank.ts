import type { Chess, Color, Square } from 'chess.js';
import { occupiedSquares, opponentOf, toColorName, type AttackMap } from './attack-map.js';

function fileIndex(square: Square): number {
  return square.charCodeAt(0) - 97;
}

/**
 * `destination`'s piece delivers check to `mover`'s opponent's king along
 * the king's own back rank while the king is boxed in by its own pieces on
 * the rank in front — the classic back-rank weakness shape. Not gated on
 * whether the check can be blocked or the checker captured (same looseness
 * as the other detectors); `classifyTacticMotif` already runs its
 * `checkmate` pre-check first, so an actual mate never reaches here.
 */
export function exploitsWeakBackRank(chess: Chess, attackMap: AttackMap, mover: Color, destination: Square): boolean {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(chess).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return false;

  const homeRank = opponent === 'w' ? '1' : '8';
  if (king.square[1] !== homeRank) return false;

  const checker = chess.get(destination);
  if (!checker || checker.color !== mover || (checker.type !== 'r' && checker.type !== 'q')) return false;

  const checksKing = (attackMap.attackersOf.get(king.square)?.[toColorName(mover)] ?? []).includes(destination);
  if (!checksKing) return false;

  const forwardRank = opponent === 'w' ? '2' : '7';
  const kingFile = fileIndex(king.square);
  for (let file = kingFile - 1; file <= kingFile + 1; file++) {
    if (file < 0 || file > 7) continue;
    const square = (String.fromCharCode(97 + file) + forwardRank) as Square;
    const occupant = chess.get(square);
    if (!occupant || occupant.color !== opponent) return false;
  }
  return true;
}
