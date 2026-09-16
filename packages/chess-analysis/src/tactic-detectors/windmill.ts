import { Chess, type Square } from 'chess.js';
import { discoveredCheckDetector } from './discovered-check.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The grinder: a discovered check whose own piece captures, and which can do
 * the same thing again the moment the king steps away.
 *
 * A full windmill is a repeating cycle four plies long, and proving one needs
 * a search. What is checkable in two is the turn of the cycle that makes it a
 * windmill rather than a one-off discovered check: the king is forced away,
 * and the same piece can come straight back with check — which is what lets
 * it keep harvesting. The sentence says "starts a windmill" rather than
 * promising the whole harvest.
 */
export const windmillDetector: TacticDetector = {
  type: 'windmill',
  priority: 7,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move?.captured) return [];
    if (discoveredCheckDetector.detect(ctx).length === 0) return [];

    const replies = ctx.facts.replies();
    if (!replies || replies.length === 0) return [];
    const mover = ctx.mover === 'w' ? 'white' : 'black';
    if (!replies.every((reply) => canGrindAgain(reply.fen, ctx.destination!, mover))) return [];

    const claim: TacticClaim = {
      type: 'windmill',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'material',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: `starts a windmill with the piece on ${ctx.destination}`
    };
    return [claim];
  }
};

/** Can the same piece swing back and check again? That return is the cycle;
 * one turn of it is enough to name the pattern. */
function canGrindAgain(fen: string, grinder: Square, mover: 'white' | 'black'): boolean {
  const board = new Chess(fen);
  if (board.turn() !== (mover === 'white' ? 'w' : 'b')) return false;

  return board.moves({ square: grinder }).some((san) => san.includes('+') || san.includes('#'));
}
