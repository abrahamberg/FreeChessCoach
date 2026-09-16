import type { Square } from 'chess.js';
import { pieceNameAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** The rank each colour's pieces start on. A minor piece still standing on
 * it hasn't been developed yet, whatever else has happened. */
const HOME_RANK: Record<'w' | 'b', string> = { w: '1', b: '8' };

/**
 * A knight or bishop leaving its starting rank for the first time.
 *
 * The plainest entry in the quiet-move vocabulary, and the reason it exists:
 * "Nothing to flag — a solid, natural move" was what a review said about
 * ordinary development, which is both true and useless. Naming it costs one
 * comparison and turns the empty state into a sentence a beginner can learn
 * from.
 */
export const developsDetector: TacticDetector = {
  type: 'develops',
  priority: 98,
  detect: (ctx) => {
    const move = ctx.move;
    if (!ctx.after || !ctx.destination || !move) return [];
    if (move.piece !== 'n' && move.piece !== 'b') return [];

    const from = move.from as Square;
    const homeRank = HOME_RANK[ctx.mover];
    if (from[1] !== homeRank || ctx.destination[1] === homeRank) return [];

    const claim: TacticClaim = {
      type: 'develops',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from, to: ctx.destination }], highlights: [] },
      detail: `brings the ${pieceNameAt(ctx.after, ctx.destination)} out to ${ctx.destination}`
    };
    return [claim];
  }
};
