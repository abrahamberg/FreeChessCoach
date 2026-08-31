import type { Square } from 'chess.js';
import { opponentOf, toColorName } from '../attack-map.js';
import { overloadedDefenders } from '../piece-safety.js';
import type { TacticDetector } from './types.js';

/** Reuses `piece-safety.ts`'s color-agnostic `overloadedDefenders` (the same
 * "sole defender of 2+ attacked pieces" computation already backing
 * `PositionFeatures`) rather than re-deriving it — filtered to the
 * opponent's side, and fires when the moved piece is itself one of the
 * attackers bearing down on one of the two-plus duties, i.e. this move is
 * what put the defender in an impossible spot. */
export const overloadedDefenderDetector: TacticDetector = {
  type: 'overloadedDefender',
  priority: 35,
  detect: (ctx) => {
    if (ctx.after === null || ctx.afterAttackMap === null || ctx.destination === null) return false;
    const after = ctx.after;
    const afterAttackMap = ctx.afterAttackMap;
    const destination = ctx.destination;
    const opponent = opponentOf(ctx.mover);
    const moverName = toColorName(ctx.mover);

    return overloadedDefenders(after, afterAttackMap)
      .filter((hit) => after.get(hit.square as Square)?.color === opponent)
      .some((hit) =>
        hit.defending.some((duty) => (afterAttackMap.attackersOf.get(duty as Square)?.[moverName] ?? []).includes(destination))
      );
  }
};
