import type { Square } from 'chess.js';
import { PIECE_NAMES } from '../piece-names.js';
import { pawnStructure } from '../pawn-structure.js';
import { toColorName } from '../attack-map.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** A pawn reaching the back rank. The gain is real material, so unlike most
 * of phase D this one has a prize to name. */
export const promotionTacticDetector: TacticDetector = {
  type: 'promotionTactic',
  priority: 12,
  detect: (ctx) => {
    const promotion = ctx.move?.promotion;
    if (!ctx.after || !ctx.destination || !promotion) return [];

    const claim: TacticClaim = {
      type: 'promotionTactic',
      actor: ctx.destination,
      targets: [ctx.destination],
      victim: null,
      gainKind: 'material',
      // A promotion trades the pawn for the new piece, so the swing is the
      // difference, not the piece's whole value.
      expectedGain: PIECE_VALUES[promotion] - PIECE_VALUES.p,
      prize: PIECE_NAMES[promotion],
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: `promotes to a ${PIECE_NAMES[promotion]} on ${ctx.destination}`
    };
    return [claim];
  }
};

/** Promoting to anything but a queen — almost always because a queen would
 * stalemate or because a knight comes with check, and always worth its own
 * sentence. */
export const underPromotionDetector: TacticDetector = {
  type: 'underPromotion',
  priority: 11,
  detect: (ctx) => {
    const promotion = ctx.move?.promotion;
    if (!ctx.after || !ctx.destination || !promotion || promotion === 'q') return [];

    const claim: TacticClaim = {
      type: 'underPromotion',
      actor: ctx.destination,
      targets: [ctx.destination],
      victim: null,
      gainKind: 'material',
      expectedGain: PIECE_VALUES[promotion] - PIECE_VALUES.p,
      prize: PIECE_NAMES[promotion],
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: `promotes to a ${PIECE_NAMES[promotion]} rather than a queen`
    };
    return [claim];
  }
};

/**
 * A pawn sacrifice that leaves the mover with a passed pawn they didn't have.
 *
 * The sacrifice is what makes it a breakthrough rather than a pawn move: a
 * push into empty space that happens to create a passer is `spaceGain`, and
 * counting those made one in twelve quiet moves a "breakthrough". So the
 * pawn has to take something, or be takeable where it lands.
 */
export const pawnBreakthroughDetector: TacticDetector = {
  type: 'pawnBreakthrough',
  priority: 92,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || ctx.move?.piece !== 'p') return [];
    const sacrificed = ctx.move.captured !== undefined || ctx.facts.exchangeAfter(ctx.destination, ctx.opponent) > 0;
    if (!sacrificed) return [];
    const colour = toColorName(ctx.mover);
    const before = new Set(passedPawnSquares(ctx.before, colour));
    const gained = passedPawnSquares(ctx.after, colour).filter((square) => !before.has(square));
    if (gained.length === 0) return [];

    const claim: TacticClaim = {
      type: 'pawnBreakthrough',
      actor: ctx.destination,
      targets: gained,
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: gained },
      detail: `creates a passed pawn on ${gained[0]}`
    };
    return [claim];
  }
};

function passedPawnSquares(chess: Parameters<typeof pawnStructure>[0], colour: 'white' | 'black'): Square[] {
  return pawnStructure(chess)
    .passedPawns.filter((pawn) => pawn.color === colour)
    .map((pawn) => pawn.square as Square);
}
