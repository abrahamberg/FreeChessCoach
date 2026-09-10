import { attackersOf, defendersOf, enemyTargetsOf, pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move hits something worth more than the piece hitting it, which wasn't
 * attacked before — so the opponent has to answer instead of getting on with
 * their own plan.
 *
 * `7…c5` in the reported game is the case this exists for: a pawn hitting a
 * queen, the clearest tempo gain there is, printing "Nothing to flag" because
 * the vocabulary had no word that wasn't about winning material (TR-06).
 * It is not a material claim — the queen simply moves — which is exactly why
 * it needed its own gain kind rather than being squeezed into `fork`.
 */
export const gainsTempoDetector: TacticDetector = {
  type: 'gainsTempo',
  priority: 96,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const destination = ctx.destination;
    const attackerValue = pieceValueAt(after, destination);

    const wasAttacked = new Set(enemyTargetsOf(ctx.before, ctx.beforeAttackMap, ctx.move?.from ?? destination, ctx.opponent));
    const target = enemyTargetsOf(after, ctx.afterAttackMap, destination, ctx.opponent)
      .filter((square) => !wasAttacked.has(square))
      .filter((square) => pieceValueAt(after, square) > attackerValue)
      // A piece that can simply take the attacker back isn't being chased —
      // unless the attacker is a pawn, which is always the cheaper trade.
      .filter(() => attackerValue === 1 || defendersOf(ctx.afterAttackMap!, destination, ctx.opponent).length === 0)
      .sort((left, right) => pieceValueAt(after, right) - pieceValueAt(after, left))[0];
    if (!target) return [];
    // The attacker itself has to be worth attacking with: a piece already
    // hanging on its new square is losing a tempo, not winning one.
    if (attackersOf(ctx.afterAttackMap, destination, ctx.opponent).length > defendersOf(ctx.afterAttackMap, destination, ctx.mover).length && attackerValue > 1) {
      return [];
    }

    const claim: TacticClaim = {
      type: 'gainsTempo',
      actor: destination,
      targets: [target],
      victim: null,
      gainKind: 'tempo',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from: destination, to: target }], highlights: [] },
      detail: `hits the ${pieceNameAt(after, target)} on ${target} with a ${pieceNameAt(after, destination)}`
    };
    return [claim];
  }
};
