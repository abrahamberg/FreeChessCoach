import type { Square } from 'chess.js';
import { attackersOf, pieceNameAt } from '../tactic-board-facts.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * An enemy piece this move leaves attacked with nowhere safe to go.
 *
 * Move-scoped, unlike the shipped detector, which fired on any trapped piece
 * anywhere on the board whether the move had anything to do with it
 * (`docs/tactics-rework.md` §5 layer 1). A piece counts only if it was not
 * already trapped before the move, or if the moved piece is one of the ones
 * attacking it — otherwise this is a standing feature of the position, not
 * something the move did.
 */
export const trappedPieceDetector: TacticDetector = {
  type: 'trappedPiece',
  priority: 50,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const destination = ctx.destination;
    // `trappedPieces` needs the trapped side to move, so "was it already
    // trapped?" is asked at the null-move position, not at `before` (where
    // it is the mover's turn and the answer would always be empty).
    const alreadyTrapped = new Set(ctx.facts.trappedBefore().map((hit) => hit.square));

    return ctx.facts.trappedAfter()
      .filter((hit) => !alreadyTrapped.has(hit.square) || attackersOf(ctx.afterAttackMap!, hit.square, ctx.mover).includes(destination))
      .map((hit): TacticClaim => ({
        type: 'trappedPiece',
        actor: destination,
        targets: [hit.square as Square],
        victim: hit.square as Square,
        gainKind: 'material',
        expectedGain: PIECE_VALUES[hit.piece],
        prize: pieceNameAt(after, hit.square),
        evidence: { arrows: [], highlights: [hit.square] },
        detail: `${pieceNameAt(after, hit.square)} on ${hit.square} is trapped`
      }));
  }
};
