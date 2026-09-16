import type { Square } from 'chess.js';
import { enemyTargetsOf, pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * One of the mover's pieces was hanging, still is, and the move answers by
 * threatening something worth at least as much instead of retreating.
 *
 * The counter-threat has to be *new*: an enemy piece the mover was already
 * attacking before the move is not what saved the hanging piece.
 */
export const counterAttackDetector: TacticDetector = {
  type: 'counterAttack',
  priority: 80,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const destination = ctx.destination;

    const stillHanging = ctx.facts.moverPiecesUnderAttack()
      .filter((piece) => piece.type !== 'k')
      .filter((piece) => ctx.facts.exchangeBefore(piece.square, ctx.opponent) > 0)
      .filter((piece) => ctx.facts.exchangeAfter(piece.square, ctx.opponent) > 0);
    if (stillHanging.length === 0) return [];

    const atRisk = Math.max(...stillHanging.map((piece) => pieceValueAt(after, piece.square)));
    const alreadyAttacked = new Set(enemyTargetsOf(ctx.before, ctx.beforeAttackMap, destination, ctx.opponent));
    const counterTarget = enemyTargetsOf(after, ctx.afterAttackMap, destination, ctx.opponent)
      .filter((square) => !alreadyAttacked.has(square))
      .filter((square) => pieceValueAt(after, square) >= atRisk)
      .sort((left, right) => pieceValueAt(after, right) - pieceValueAt(after, left))[0];
    if (!counterTarget) return [];

    const claim: TacticClaim = {
      type: 'counterAttack',
      actor: destination,
      targets: [counterTarget, ...stillHanging.map((piece) => piece.square as Square)],
      victim: null,
      gainKind: 'safety',
      expectedGain: atRisk,
      prize: null,
      evidence: { arrows: [{ from: destination, to: counterTarget }], highlights: stillHanging.map((piece) => piece.square) },
      detail: `answers the threat by hitting the ${pieceNameAt(after, counterTarget)} on ${counterTarget}`
    };
    return [claim];
  }
};
