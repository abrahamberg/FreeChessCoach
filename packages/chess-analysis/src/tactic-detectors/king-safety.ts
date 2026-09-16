import { attackersOf, kingSquareOf } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * Castling, or a king move that walks out of the opponent's fire.
 *
 * chess.js flags castling on the move itself (`k`/`q`), so the common case is
 * exact rather than inferred; the second case is the endgame king walk, which
 * is measured by how many enemy pieces bear on the square rather than guessed
 * from where the king went.
 */
export const kingSafetyDetector: TacticDetector = {
  type: 'kingSafety',
  priority: 99,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination || !ctx.move) return [];
    const castled = ctx.move.flags.includes('k') || ctx.move.flags.includes('q');
    if (!castled && ctx.move.piece !== 'k') return [];

    const king = kingSquareOf(ctx.after, ctx.mover);
    if (!king) return [];
    if (!castled) {
      const before = attackersOf(ctx.beforeAttackMap, ctx.move.from as never, ctx.opponent).length;
      const now = attackersOf(ctx.afterAttackMap, king, ctx.opponent).length;
      if (now >= before) return [];
    }

    const claim: TacticClaim = {
      type: 'kingSafety',
      actor: king,
      targets: [],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [king] },
      detail: castled ? 'castles the king into safety' : `walks the king to ${king}, out of the firing line`
    };
    return [claim];
  }
};
