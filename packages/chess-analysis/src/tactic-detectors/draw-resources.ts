import { materialBalance } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** Below this the mover is losing, which is what makes a draw a *resource*
 * rather than a concession. Pawns. */
const LOSING_MARGIN = 3;

/** The move leaves the opponent with no legal move and no check — a full
 * point saved, and the one draw motif a single position answers exactly. */
export const stalemateResourceDetector: TacticDetector = {
  type: 'stalemateResource',
  priority: 82,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.after.isStalemate()) return [];
    const claim: TacticClaim = {
      type: 'stalemateResource',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'safety',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: 'leaves them stalemated'
    };
    return [claim];
  }
};

/** A trade that reaches a position neither side can win, made by the side
 * that was losing — insufficient material, or any of chess.js's own drawn
 * conditions. A player who is *ahead* trading into the same position has
 * thrown a win away, so the margin check is what keeps this a compliment. */
export const simplifiesToDrawDetector: TacticDetector = {
  type: 'simplifiesToDraw',
  priority: 86,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination) return [];
    if (ctx.after.isStalemate()) return [];
    if (!ctx.after.isInsufficientMaterial() && !ctx.after.isDraw()) return [];
    if (materialBalance(ctx.before, ctx.mover) > -LOSING_MARGIN) return [];

    const claim: TacticClaim = {
      type: 'simplifiesToDraw',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'safety',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: 'trades down into a position neither side can win'
    };
    return [claim];
  }
};
