import { materialBalance } from '../tactic-board-facts.js';
import { hasCheckAvailable } from '../tactic-lookahead.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** A side this far behind is playing for a draw, not for material — the
 * threshold that separates "starting a perpetual" from "checking because it
 * wins something". Pawns. */
const LOSING_MARGIN = 3;

/**
 * A check from a materially lost position that the opponent cannot get away
 * from: every legal reply leaves the mover another check.
 *
 * Two plies deep and no further. A genuine perpetual is a repetition, which
 * needs move history this pipeline doesn't hand a single-ply detector, so
 * this claims the *start* of one — which is what the card wants to say
 * anyway ("you found the perpetual") and what a player has to see at the
 * board.
 */
export const perpetualCheckDetector: TacticDetector = {
  type: 'perpetualCheck',
  priority: 84,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination) return [];
    if (!ctx.after.isCheck() || ctx.after.isCheckmate()) return [];
    if (materialBalance(ctx.before, ctx.mover) > -LOSING_MARGIN) return [];

    const replies = ctx.facts.replies();
    if (!replies || replies.length === 0) return [];
    if (!replies.every((reply) => hasCheckAvailable(reply.fen, ctx.mover))) return [];

    const claim: TacticClaim = {
      type: 'perpetualCheck',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'safety',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: 'starts a check the king cannot walk out of'
    };
    return [claim];
  }
};
