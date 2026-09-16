import { kingSquareOf, pieceNameAt } from '../tactic-board-facts.js';
import { exploitsWeakBackRank } from '../tactic-back-rank.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** The move checks a king that is boxed in on its own back rank by its own
 * pawns — the mate pattern, claimed as mate rather than material. */
export const weakBackRankDetector: TacticDetector = {
  type: 'weakBackRank',
  priority: 45,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    if (!exploitsWeakBackRank(ctx.after, ctx.afterAttackMap, ctx.mover, ctx.destination)) return [];
    const king = kingSquareOf(ctx.after, ctx.opponent);
    if (!king) return [];
    const destination = ctx.destination;

    const claim: TacticClaim = {
      type: 'weakBackRank',
      actor: destination,
      targets: [king],
      victim: null,
      gainKind: 'mate',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from: destination, to: king }], highlights: [] },
      detail: `${pieceNameAt(ctx.after, destination)} on ${destination} checks the king on ${king}, boxed in on the back rank`
    };
    return [claim];
  }
};
