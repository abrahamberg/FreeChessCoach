import { pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import { raysFrom } from '../tactic-rays.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move lines a slider up *behind one of the mover's own pieces* at an
 * enemy piece — a battery whose pressure only becomes real when the front
 * piece steps aside.
 *
 * Distinct from `pin` and `skewer`, which both look through an *enemy* piece.
 * The instructive half is that the front piece is now free to move with
 * tempo, which is a thing worth pointing out and a thing neither of the other
 * two motifs can say.
 *
 * The piece behind has to be a rook, queen or king. Aim a bishop through its
 * own pawn at a knight and you have described half the openings ever played;
 * the pressure only means something when what's behind is worth more than
 * anything that can block it.
 */
export const xRayAttackDetector: TacticDetector = {
  type: 'xRayAttack',
  priority: 88,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination) return [];
    const after = ctx.after;
    const destination = ctx.destination;

    return raysFrom(after, destination)
      .map((ray) => ({ front: ray.occupants[0], behind: ray.occupants[1] }))
      .filter((pair) => pair.front !== undefined && pair.behind !== undefined)
      .filter((pair) => after.get(pair.front!)?.color === ctx.mover)
      .filter((pair) => after.get(pair.behind!)?.color === ctx.opponent)
      .filter((pair) => pieceValueAt(after, pair.behind!) >= 5 || after.get(pair.behind!)?.type === 'k')
      .slice(0, 1)
      .map(({ front, behind }): TacticClaim => ({
        type: 'xRayAttack',
        actor: destination,
        targets: [front!, behind!],
        victim: null,
        gainKind: 'positional',
        expectedGain: 0,
        prize: null,
        evidence: { arrows: [{ from: destination, to: behind! }], highlights: [front!] },
        detail: `lines up behind the ${pieceNameAt(after, front!)} on ${front} at the ${pieceNameAt(after, behind!)} on ${behind}`
      }));
  }
};
