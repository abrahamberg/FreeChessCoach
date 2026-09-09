import type { Square } from 'chess.js';
import { defendersOf, pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import { attackedSquaresOf } from './facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move drops a piece onto a square that cuts an enemy defender off from
 * what it was guarding, leaving that piece attacked and undefended.
 *
 * The mirror of `blocks-threat.ts` — same "the destination is the only newly
 * occupied square" reasoning, pointed at the opponent's defensive lines
 * instead of their attacking ones.
 */
export const interferenceDetector: TacticDetector = {
  type: 'interference',
  priority: 39,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const attackMap = ctx.afterAttackMap;
    const destination = ctx.destination;

    return attackedSquaresOf(after, attackMap, ctx.opponent, ctx.mover)
      .filter((piece) => piece.square !== destination)
      .filter((piece) => defendersOf(attackMap, piece.square, ctx.opponent).length === 0)
      // Resolved once per candidate and carried through: the arrows below are
      // the same defenders the filter asks about, and re-deriving them there
      // walks both attack maps a second time for every claim.
      .map((piece) => ({ piece, cutOff: cutOffDefenders(ctx, piece.square) }))
      .filter(({ cutOff }) => cutOff.length > 0)
      .map(({ piece, cutOff }): TacticClaim => ({
        type: 'interference',
        actor: destination,
        targets: [piece.square],
        victim: piece.square,
        gainKind: 'material',
        expectedGain: pieceValueAt(after, piece.square),
        prize: pieceNameAt(after, piece.square),
        evidence: { arrows: cutOff.map((from) => ({ from, to: piece.square })), highlights: [destination] },
        detail: `cuts the guard off from the ${pieceNameAt(after, piece.square)} on ${piece.square}`
      }));
  }
};

/** Defenders of `square` that were there before this move and, though still
 * on the board, no longer reach it. */
function cutOffDefenders(ctx: Parameters<TacticDetector['detect']>[0], square: Square): Square[] {
  const after = ctx.after!;
  const stillDefending = new Set(defendersOf(ctx.afterAttackMap!, square, ctx.opponent));
  return defendersOf(ctx.beforeAttackMap, square, ctx.opponent).filter(
    (defender) => after.get(defender)?.color === ctx.opponent && !stillDefending.has(defender)
  );
}
