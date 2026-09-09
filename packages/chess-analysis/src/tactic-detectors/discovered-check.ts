import { PIECE_NAMES } from '../move-reasons.js';
import { attackersOf, kingSquareOf } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move steps a piece aside and the piece behind it gives the check — the
 * check comes from a piece that did not move.
 *
 * `doubleCheck` can't cover this (it needs two checkers) and
 * `discoveredAttack` loses the fact that the move is *forcing*, which is the
 * instructive half: TR-09 in `tactic-review-cases.ts` is exactly this case
 * printing "gains a discovered attack on e8" without ever saying e8 is the
 * king. The cheapest addition in `docs/tactics-rework.md` §6, since
 * `discoveredAttackDetail` already computes the revealed square and only
 * needs to be asked whether it holds the king.
 */
export const discoveredCheckDetector: TacticDetector = {
  type: 'discoveredCheck',
  priority: 6,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    if (!ctx.after.isCheck()) return [];

    const king = kingSquareOf(ctx.after, ctx.opponent);
    if (!king) return [];
    // The checker must be a piece that did not move: a check delivered by
    // the moved piece itself is an ordinary check, not a discovered one.
    const checkers = attackersOf(ctx.afterAttackMap, king, ctx.mover);
    if (!checkers.some((square) => square !== ctx.destination)) return [];

    const hit = ctx.facts.discovered();
    if (!hit || hit.revealed !== king) return [];

    const claim: TacticClaim = {
      type: 'discoveredCheck',
      actor: hit.piece,
      targets: [king],
      victim: null,
      gainKind: 'tempo',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from: hit.piece, to: king }], highlights: [ctx.destination] },
      detail: `steps aside and the ${PIECE_NAMES[hit.pieceType]} on ${hit.piece} checks the king`
    };
    return [claim];
  }
};
