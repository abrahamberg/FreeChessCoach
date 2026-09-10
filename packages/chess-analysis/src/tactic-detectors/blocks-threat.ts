import type { Square } from 'chess.js';
import { attackersOf, pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move interposes: an enemy piece was bearing down on one of the mover's
 * pieces and, because the destination square is now occupied, no longer is.
 *
 * The destination is the only square whose occupancy this move can newly
 * create, so an attacker that survives the move but loses its line to a
 * target it kept attacking through that square was blocked by it — no ray
 * walk needed beyond the attack maps already built for the position.
 */
export const blocksThreatDetector: TacticDetector = {
  type: 'blocksThreat',
  priority: 78,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const afterAttackMap = ctx.afterAttackMap;
    const destination = ctx.destination;

    return ctx.facts.moverPiecesUnderAttack()
      .filter((piece) => piece.square !== destination)
      .filter((piece) => piece.type === 'k' || ctx.facts.exchangeBefore(piece.square, ctx.opponent) > 0)
      .filter((piece) => after.get(piece.square)?.color === ctx.mover)
      .map((piece) => ({
        piece,
        blocked: attackersOf(ctx.beforeAttackMap, piece.square, ctx.opponent).filter(
          (attacker) => after.get(attacker) !== undefined && !attackersOf(afterAttackMap, piece.square, ctx.opponent).includes(attacker)
        )
      }))
      .filter(({ blocked }) => blocked.length > 0)
      .map(({ piece, blocked }): TacticClaim => ({
        type: 'blocksThreat',
        actor: destination,
        targets: [piece.square as Square],
        victim: null,
        gainKind: 'safety',
        expectedGain: pieceValueAt(ctx.before, piece.square),
        prize: null,
        evidence: { arrows: blocked.map((attacker) => ({ from: attacker, to: piece.square })), highlights: [destination] },
        detail: `steps in front of the ${pieceNameAt(ctx.before, piece.square)} on ${piece.square}`
      }));
  }
};
