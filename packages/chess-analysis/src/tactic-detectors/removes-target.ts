import type { Square } from 'chess.js';
import { pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** The piece that moved was there to be taken at a profit, and on its new
 * square it isn't — the simplest defensive idea there is, and one the
 * offence-only vocabulary had no word for. */
export const removesTargetDetector: TacticDetector = {
  type: 'removesTarget',
  priority: 76,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move) return [];
    const from = ctx.move.from as Square;
    // A pawn stepping out of the way is not a card. The defensive family
    // exists to name the move that saved something worth saving.
    if (pieceValueAt(ctx.before, from) < 3) return [];
    if (ctx.facts.exchangeBefore(from, ctx.opponent) <= 0) return [];
    if (ctx.facts.exchangeAfter(ctx.destination, ctx.opponent) > 0) return [];

    const claim: TacticClaim = {
      type: 'removesTarget',
      actor: ctx.destination,
      targets: [from],
      victim: null,
      gainKind: 'safety',
      expectedGain: pieceValueAt(ctx.before, from),
      prize: null,
      evidence: { arrows: [{ from, to: ctx.destination }], highlights: [] },
      detail: `moves the ${pieceNameAt(ctx.before, from)} off ${from}, out of reach`
    };
    return [claim];
  }
};
