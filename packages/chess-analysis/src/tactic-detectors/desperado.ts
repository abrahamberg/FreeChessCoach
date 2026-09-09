import type { Square } from 'chess.js';
import { PIECE_NAMES } from '../move-reasons.js';
import { pieceNameAt } from '../tactic-board-facts.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * A piece that was going to be lost anyway takes something on its way out.
 *
 * The condition that makes it a desperado rather than a blunder is that the
 * piece was *already* doomed before the move: it could be taken at a profit
 * on its old square, and it can still be taken on its new one. Selling it for
 * a pawn is then a gain, not a loss — which is exactly the arithmetic a
 * static safety gate gets backwards.
 */
export const desperadoDetector: TacticDetector = {
  type: 'desperado',
  priority: 55,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move?.captured) return [];
    const from = ctx.move.from as Square;
    // Doomed means the piece had nowhere safe to go, not merely that it was
    // attacked: an attacked pawn that captures back is an ordinary exchange,
    // and 73 of them in the opening corpus read as desperados before this.
    if (!ctx.facts.moverTrappedBefore().some((hit) => hit.square === from)) return [];
    if (ctx.facts.exchangeAfter(ctx.destination, ctx.opponent) <= 0) return [];

    const claim: TacticClaim = {
      type: 'desperado',
      actor: ctx.destination,
      targets: [ctx.destination],
      victim: null,
      gainKind: 'material',
      expectedGain: PIECE_VALUES[ctx.move.captured],
      prize: PIECE_NAMES[ctx.move.captured],
      evidence: { arrows: [{ from, to: ctx.destination }], highlights: [] },
      detail: `sells the doomed ${pieceNameAt(ctx.before, from)} for the ${PIECE_NAMES[ctx.move.captured]} on ${ctx.destination}`
    };
    return [claim];
  }
};
