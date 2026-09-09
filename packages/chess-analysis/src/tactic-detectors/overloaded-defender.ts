import type { Square } from 'chess.js';
import { attackersOf, formatSquareList, pieceNameAt } from '../tactic-board-facts.js';
import { overloadedDefenders } from '../piece-safety.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** Reuses `piece-safety.ts`'s colour-agnostic `overloadedDefenders` (the
 * same "sole defender of 2+ attacked pieces" computation already backing
 * `PositionFeatures`) rather than re-deriving it — filtered to the
 * opponent's side, and claimed only when the moved piece is itself one of
 * the attackers bearing down on one of the two-plus duties, i.e. this move
 * is what put the defender in an impossible spot. */
export const overloadedDefenderDetector: TacticDetector = {
  type: 'overloadedDefender',
  priority: 35,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const attackMap = ctx.afterAttackMap;
    const destination = ctx.destination;

    return overloadedDefenders(after, attackMap)
      .filter((hit) => after.get(hit.square as Square)?.color === ctx.opponent)
      .filter((hit) => hit.defending.some((duty) => attackersOf(attackMap, duty as Square, ctx.mover).includes(destination)))
      .map((hit): TacticClaim => {
        const duties = hit.defending as Square[];
        return {
          type: 'overloadedDefender',
          actor: destination,
          targets: [hit.square as Square, ...duties],
          // Positional, not material: an overload is pressure, and which of
          // the two duties actually falls (if either does) depends on a line
          // no static exchange on one square can see. Claiming a prize here
          // would be claiming something the card then can't back up.
          victim: null,
          gainKind: 'positional',
          expectedGain: 0,
          prize: null,
          evidence: { arrows: duties.map((square) => ({ from: hit.square, to: square })), highlights: [hit.square] },
          detail: `overloads the ${pieceNameAt(after, hit.square as Square)} on ${hit.square}, which must also guard ${formatSquareList(duties)}`
        };
      });
  }
};
