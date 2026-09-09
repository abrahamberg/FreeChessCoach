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
 * chess.js's own legal-move generation rather than the coarser
 * `PositionFeatures.controlledSquares` feature, so `chess` must already have
 * `color` to move (true whenever this is called on the position right after
 * the opponent's move, which is the only time this question makes sense to
 * ask).
 *
 * Pawns are never candidates: a pawn backed into a corner with no square to
 * advance to is just a normal, expected feature of closed pawn play, not a
 * "trapped piece" tactic — only pieces (knight, bishop, rook, queen) count.
 *
 * Two exclusions come from `docs/tactics-rework.md` §1: `chess.moves({
 * square })` returns nothing for two reasons far more common than being
 * cornered, and attributing every report across the 400-line opening corpus
 * put **71.7% on absolute pins and 13.2% on the side simply being in check**
 * — 85% of the output in ordinary play was an artefact of reading "cannot
 * move" as "has nowhere to go".
 *
 * - **Side in check.** Every non-king piece has zero legal moves that don't
 *   address the check. The tactic there is the check, not a trap, so the
 *   whole position is skipped.
 * - **Absolutely pinned.** A pinned knight on its natural square, defended,
 *   is pinned — a motif we already have a word for. Reporting it as trapped
 *   as well is the noisy co-fire on every real pin (TR-01, TR-10).
 */
export function trappedPieces(chess: Chess, color: Color): TrappedHit[] {
  if (chess.turn() !== color) return [];
  // A piece cannot be shown to have no escape while its side owes a reply to
  // a check — every legal move is a check answer, so the move list says
  // nothing about that piece's own mobility.
  if (chess.isCheck()) return [];

  const opponent = opponentOf(color);
  const opponentName = toColorName(opponent);
  const attackMap = buildAttackMap(chess);
  const hits: TrappedHit[] = [];

  for (const piece of occupiedSquares(chess)) {
    if (piece.color !== color || piece.type === 'k' || piece.type === 'p') continue;

    const isAttacked = (attackMap.attackersOf.get(piece.square)?.[opponentName]?.length ?? 0) > 0;
    if (!isAttacked) continue;
    if (chess.isAttacked(piece.square, opponent) && isAbsolutelyPinned(chess, piece.square, color)) continue;

    const destinations = chess.moves({ square: piece.square, verbose: true }).map((move) => move.to as Square);
    const hasSafeSquare = destinations.some(
      (square) => (attackMap.attackersOf.get(square)?.[opponentName]?.length ?? 0) === 0
    );
    if (!hasSafeSquare) hits.push({ square: piece.square, piece: piece.type });
  }
  return hits;
}

/** A piece with no legal moves at all whose side is not in check is pinned
 * against its own king — chess.js won't generate a move that exposes it, so
 * an empty move list on a non-check position is exactly that. Cheaper and
 * more reliable than re-walking the rays `tactic-pins.ts` already walks. */
function isAbsolutelyPinned(chess: Chess, square: Square, color: Color): boolean {
  if (chess.turn() !== color) return false;
  return chess.moves({ square }).length === 0;
}
