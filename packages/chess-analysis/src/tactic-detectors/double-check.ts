import { attackersOf, formatSquareList, kingSquareOf } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** Two or more of the mover's pieces attack the enemy king at once —
 * discovered or not. The king must move, which is what makes a double check
 * worth naming even when it wins nothing directly. */
export const doubleCheckDetector: TacticDetector = {
  type: 'doubleCheck',
  priority: 5,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const king = kingSquareOf(ctx.after, ctx.opponent);
    if (!king) return [];

    const checkers = attackersOf(ctx.afterAttackMap, king, ctx.mover);
    if (checkers.length < 2) return [];

    const claim: TacticClaim = {
      type: 'doubleCheck',
      actor: ctx.destination,
      targets: [king],
      victim: null,
      gainKind: 'tempo',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: checkers.map((square) => ({ from: square, to: king })), highlights: [] },
      detail: `checks the king on ${king} from ${formatSquareList(checkers)} at once`
    };
    return [claim];
  }
};
