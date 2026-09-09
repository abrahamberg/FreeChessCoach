import { pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import { removesDefender } from '../tactic-removes-defender.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** Ignores `ctx.after`/`ctx.afterAttackMap` — same reason as
 * discovered-attack.ts. The claimed prize is the piece left undefended, not
 * the defender that was captured: that is what the tactic is *for*. */
export const removesDefenderDetector: TacticDetector = {
  type: 'removesDefender',
  priority: 40,
  detect: (ctx) => {
    if (!ctx.after) return [];
    const hit = removesDefender(ctx.fenBefore, ctx.moveSan, ctx.mover);
    if (!hit) return [];
    const after = ctx.after;

    const claim: TacticClaim = {
      type: 'removesDefender',
      actor: hit.capturedDefender,
      targets: [hit.exposedTarget],
      victim: hit.exposedTarget,
      gainKind: 'material',
      expectedGain: pieceValueAt(after, hit.exposedTarget),
      prize: pieceNameAt(after, hit.exposedTarget),
      evidence: { arrows: [{ from: hit.capturedDefender, to: hit.exposedTarget }], highlights: [] },
      detail: `removes the defender on ${hit.capturedDefender}, leaving the ${pieceNameAt(after, hit.exposedTarget)} on ${hit.exposedTarget} undefended`
    };
    return [claim];
  }
};
