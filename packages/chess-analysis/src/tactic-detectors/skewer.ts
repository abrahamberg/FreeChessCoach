import { skewers } from '../tactic-skewers.js';
import { pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** The piece this move landed on attacks through a valuable enemy piece to a
 * lesser one behind it. The claimed prize is the piece behind — that is what
 * the sentence has to be able to name. */
export const skewerDetector: TacticDetector = {
  type: 'skewer',
  priority: 15,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination) return [];
    const after = ctx.after;
    const actor = ctx.destination;

    return skewers(after)
      .filter((hit) => hit.by === actor)
      .map((hit): TacticClaim => ({
        type: 'skewer',
        actor,
        targets: [hit.front, hit.behind],
        victim: hit.behind,
        gainKind: 'material',
        expectedGain: pieceValueAt(after, hit.behind),
        prize: pieceNameAt(after, hit.behind),
        evidence: { arrows: [{ from: actor, to: hit.behind }], highlights: [hit.front] },
        detail: `skewers the ${pieceNameAt(after, hit.front)} on ${hit.front}, exposing the ${pieceNameAt(after, hit.behind)} on ${hit.behind}`
      }));
  }
};
