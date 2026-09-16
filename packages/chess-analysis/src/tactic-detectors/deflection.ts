import type { Square } from 'chess.js';
import { attackersOf, defendersOf, pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move *attacks* an enemy piece that is the sole defender of something
 * else, so the defender has to leave its post.
 *
 * `removesDefender` handles the capture case and says in its own doc comment
 * that it deliberately doesn't handle this one. The two are different advice:
 * one is "take the defender", the other is "chase it away", and only the
 * second is a deflection in the sense a coach means.
 */
export const deflectionDetector: TacticDetector = {
  type: 'deflection',
  priority: 38,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination || !ctx.move) return [];
    if (ctx.move.captured !== undefined) return [];
    const after = ctx.after;
    const attackMap = ctx.afterAttackMap;
    const destination = ctx.destination;

    return ctx.facts.overloadedAfter()
      .filter((hit) => after.get(hit.square as Square)?.color === ctx.opponent)
      .filter((hit) => attackersOf(attackMap, hit.square as Square, ctx.mover).includes(destination))
      .filter((hit) => !attackersOf(ctx.beforeAttackMap, hit.square as Square, ctx.mover).includes(ctx.move!.from as Square))
      .map((hit): TacticClaim => {
        const duties = hit.defending as Square[];
        const victim = [...duties].sort((left, right) => pieceValueAt(after, right) - pieceValueAt(after, left))[0] ?? null;
        return {
          type: 'deflection',
          actor: destination,
          targets: [hit.square as Square, ...duties],
          victim,
          gainKind: 'material',
          expectedGain: victim ? pieceValueAt(after, victim) : 0,
          prize: victim ? pieceNameAt(after, victim) : null,
          evidence: { arrows: [{ from: destination, to: hit.square }], highlights: duties },
          detail: `chases the ${pieceNameAt(after, hit.square as Square)} on ${hit.square} off its guard duty`
        };
      })
      .filter((claim) => claim.victim !== null && defendersOf(attackMap, claim.victim, ctx.opponent).length <= 1);
  }
};
