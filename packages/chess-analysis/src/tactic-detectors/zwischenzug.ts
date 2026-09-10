import { PIECE_NAMES } from '../move-reasons.js';
import { pieceValueAt } from '../tactic-board-facts.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The opponent just captured, and instead of taking back the mover throws in
 * a check or a bigger capture first.
 *
 * This is the one motif that is *defined* by move order, so it is only
 * detectable at all because the detectors are now told the opponent's
 * previous move (`context.ts`). With no history it stays silent rather than
 * guessing — an in-between move that might just be an ordinary check is not
 * a claim worth making.
 */
export const zwischenzugDetector: TacticDetector = {
  type: 'zwischenzug',
  priority: 42,
  detect: (ctx) => {
    const previous = ctx.previous;
    if (!ctx.after || !ctx.destination || !ctx.move || !previous?.wasCapture) return [];
    // Taking back on the same square is the recapture this motif is defined
    // against.
    if (ctx.move.to === previous.to) return [];

    const forcing = ctx.after.isCheck();
    // A bigger capture only counts as an in-between move if it actually
    // wins something: 6.Bxc6 in the reported game takes a knight instead of
    // recapturing a pawn, but ...bxc6 answers it and nothing is gained, so
    // it is an exchange with the moves in an unusual order, not a tactic.
    const bigger =
      ctx.move.captured !== undefined &&
      PIECE_VALUES[ctx.move.captured] > pieceValueAt(ctx.before, previous.to) &&
      ctx.facts.exchangeBefore(ctx.destination, ctx.mover) > 0;
    if (!forcing && !bigger) return [];

    const claim: TacticClaim = {
      type: 'zwischenzug',
      actor: ctx.destination,
      targets: [previous.to],
      victim: null,
      gainKind: 'tempo',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination, previous.to] },
      detail: forcing
        ? `checks first instead of taking back on ${previous.to}`
        : `takes the ${PIECE_NAMES[ctx.move.captured!]} first instead of recapturing on ${previous.to}`
    };
    return [claim];
  }
};
