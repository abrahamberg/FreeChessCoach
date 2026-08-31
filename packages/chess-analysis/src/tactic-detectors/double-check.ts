import type { Square } from 'chess.js';
import { occupiedSquares, opponentOf, toColorName } from '../attack-map.js';
import type { TacticDetector } from './types.js';

/** Ignores `ctx.afterAttackMap`'s per-square breakdown beyond a simple
 * attacker count — two-or-more mover attackers on the enemy king square is
 * exactly what "double check" means, discovered or not. */
export const doubleCheckDetector: TacticDetector = {
  type: 'doubleCheck',
  priority: 5,
  detect: (ctx) => {
    if (ctx.after === null || ctx.afterAttackMap === null) return false;
    const opponent = opponentOf(ctx.mover);
    const king = occupiedSquares(ctx.after).find((piece) => piece.type === 'k' && piece.color === opponent);
    if (!king) return false;

    const checkers = ctx.afterAttackMap.attackersOf.get(king.square as Square)?.[toColorName(ctx.mover)] ?? [];
    return checkers.length >= 2;
  }
};
