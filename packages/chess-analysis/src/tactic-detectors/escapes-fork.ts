import type { Chess, Color, Square } from 'chess.js';
import { formatSquareList } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** An enemy piece was hitting two of the mover's pieces at once before this
 * move, and isn't any more. The mirror of `fork.ts`, read off the same
 * `forks()` computation on the position before the move. */
export const escapesForkDetector: TacticDetector = {
  type: 'escapesFork',
  priority: 72,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const destination = ctx.destination;

    const stillForking = new Map(
      ctx.facts.forksAfter().map((hit) => [hit.square, ownTargets(hit.forkedSquares, after, ctx.mover).length] as const)
    );

    return ctx.facts.forksBefore()
      .filter((hit) => ctx.before.get(hit.square as Square)?.color === ctx.opponent)
      .map((hit) => ({ hit, victims: ownTargets(hit.forkedSquares, ctx.before, ctx.mover) }))
      .filter(({ hit, victims }) => victims.length >= 2 && (stillForking.get(hit.square) ?? 0) < 2)
      // Same rule as `breaks-pin.ts`: capturing the forker is a capture, and
      // the capture is the card.
      .filter(({ hit }) => hit.square !== destination)
      .map(({ hit, victims }): TacticClaim => ({
        type: 'escapesFork',
        actor: destination,
        targets: victims,
        victim: null,
        gainKind: 'safety',
        expectedGain: 0,
        prize: null,
        evidence: { arrows: victims.map((square) => ({ from: hit.square, to: square })), highlights: [hit.square] },
        detail: `breaks up the double attack on ${formatSquareList(victims)}`
      }));
  }
};

function ownTargets(squares: readonly string[], board: Chess, owner: Color): Square[] {
  return squares.filter((square) => board.get(square as Square)?.color === owner) as Square[];
}
