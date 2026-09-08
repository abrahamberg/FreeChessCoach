import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf, toColorName } from './attack-map.js';

export interface TrappedHit {
  square: Square;
  piece: PieceSymbol;
}

/**
 * A piece of `color` that is currently attacked and has no legal move to a
 * square the opponent doesn't also attack — cornered, not just immobile
 * (an immobile piece that isn't under attack yet isn't a tactic). Uses
 * chess.js's own legal-move generation (accounts for pins) rather than the
 * coarser `PositionFeatures.controlledSquares` feature, so `chess` must
 * already have `color` to move (true whenever this is called on the
 * position right after the opponent's move, which is the only time this
 * question makes sense to ask).
 *
 * Pawns are never candidates: a pawn backed into a corner with no square to
 * advance to is just a normal, expected feature of closed pawn play, not a
 * "trapped piece" tactic — only pieces (knight, bishop, rook, queen) count.
 */
export function trappedPieces(chess: Chess, color: Color): TrappedHit[] {
  const opponent = opponentOf(color);
  const opponentName = toColorName(opponent);
  const attackMap = buildAttackMap(chess);
  const hits: TrappedHit[] = [];

  for (const piece of occupiedSquares(chess)) {
    if (piece.color !== color || piece.type === 'k' || piece.type === 'p') continue;

    const isAttacked = (attackMap.attackersOf.get(piece.square)?.[opponentName]?.length ?? 0) > 0;
    if (!isAttacked) continue;

    const destinations = chess.moves({ square: piece.square, verbose: true }).map((move) => move.to as Square);
    const hasSafeSquare = destinations.some(
      (square) => (attackMap.attackersOf.get(square)?.[opponentName]?.length ?? 0) === 0
    );
    if (!hasSafeSquare) hits.push({ square: piece.square, piece: piece.type });
  }
  return hits;
}
