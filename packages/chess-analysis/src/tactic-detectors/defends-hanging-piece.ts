import type { Square } from 'chess.js';
import { pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * A piece of the mover's could have been taken at a profit before this move,
 * and is still standing on the same square afterwards without that being
 * true any more — defended, or the attacker cut off.
 *
 * Deliberately *not* the piece that moved: moving an attacked piece to safety
 * is `removesTarget`, a different idea with different advice behind it
 * ("your knight was hanging, you defended it" vs. "you moved it").
 *
 * Only pieces the opponent actually attacks are considered, which is what
 * keeps this to two or three exchange evaluations rather than one per piece
 * on the board.
 */
export const defendsHangingPieceDetector: TacticDetector = {
  type: 'defendsHangingPiece',
  priority: 74,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move) return [];
    const after = ctx.after;
    const destination = ctx.destination;
    const movedFrom = ctx.move.from as Square;

    return ctx.facts.moverPiecesUnderAttack()
      .filter((piece) => piece.type !== 'k' && piece.square !== movedFrom)
      // Same rule as `removes-target.ts`: defending a pawn is not a card.
      .filter((piece) => pieceValueAt(ctx.before, piece.square) >= 3)
      .filter((piece) => ctx.facts.exchangeBefore(piece.square, ctx.opponent) > 0)
      .filter((piece) => after.get(piece.square)?.color === ctx.mover)
      .filter((piece) => ctx.facts.exchangeAfter(piece.square, ctx.opponent) <= 0)
      .map((piece): TacticClaim => ({
        type: 'defendsHangingPiece',
        actor: destination,
        targets: [piece.square],
        victim: null,
        gainKind: 'safety',
        // What was saved, priced as the material that would otherwise have
        // gone — the narrator never turns this into a "win a rook", but the
        // ranker needs to know a rescued rook outranks a rescued pawn.
        expectedGain: pieceValueAt(ctx.before, piece.square),
        prize: null,
        evidence: { arrows: [{ from: destination, to: piece.square }], highlights: [piece.square] },
        detail: `saves the ${pieceNameAt(ctx.before, piece.square)} on ${piece.square}`
      }));
  }
};
