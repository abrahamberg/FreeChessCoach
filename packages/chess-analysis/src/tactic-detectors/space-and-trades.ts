import { toColorName } from '../attack-map.js';
import { materialBalance, pieceNameAt } from '../tactic-board-facts.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** A pawn push that crosses into the opponent's half — the concrete, checkable
 * half of "gains space", rather than a squares-controlled delta that swings
 * on every piece move. */
export const spaceGainDetector: TacticDetector = {
  type: 'spaceGain',
  priority: 100,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || ctx.move?.piece !== 'p' || ctx.move.captured !== undefined) return [];
    const rank = Number(ctx.destination[1]);
    const crossed = ctx.mover === 'w' ? rank >= 5 : rank <= 4;
    if (!crossed) return [];

    const claim: TacticClaim = {
      type: 'spaceGain',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from: ctx.move.from as never, to: ctx.destination }], highlights: [] },
      detail: `pushes a pawn to ${ctx.destination}, taking space`
    };
    return [claim];
  }
};

/** An even trade made by the side that is already ahead — the technique that
 * converts an advantage, and the one trade worth complimenting. */
export const favourableTradeDetector: TacticDetector = {
  type: 'favourableTrade',
  priority: 102,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move?.captured) return [];
    if (PIECE_VALUES[ctx.move.captured] !== PIECE_VALUES[ctx.move.piece]) return [];
    if (materialBalance(ctx.before, ctx.mover) <= 0) return [];

    const claim: TacticClaim = {
      type: 'favourableTrade',
      actor: ctx.destination,
      targets: [ctx.destination],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: 'trades a pair off while ahead on material'
    };
    return [claim];
  }
};

/**
 * The piece that moved was the mover's least active, and is more active now.
 *
 * Activity is `piece-safety.ts`'s own attack-count, the same measure
 * `PositionFeatures.mobility` is built from, so "worst piece" means the same
 * thing here as everywhere else in the report.
 */
export const improvesWorstPieceDetector: TacticDetector = {
  type: 'improvesWorstPiece',
  priority: 104,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination || !ctx.move) return [];
    if (ctx.move.piece === 'p' || ctx.move.piece === 'k') return [];
    const from = ctx.move.from;

    const activityBefore = activityOf(ctx, from);
    const worstBefore = Math.min(...ownPieceActivities(ctx));
    if (activityBefore > worstBefore) return [];
    if ((ctx.afterAttackMap.controlledBy.get(ctx.destination)?.length ?? 0) <= activityBefore) return [];

    const claim: TacticClaim = {
      type: 'improvesWorstPiece',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from: from as never, to: ctx.destination }], highlights: [] },
      detail: `activates the ${pieceNameAt(ctx.after, ctx.destination)}, the mover's least useful piece`
    };
    return [claim];
  }
};

function activityOf(ctx: Parameters<TacticDetector['detect']>[0], square: string): number {
  return ctx.beforeAttackMap.controlledBy.get(square as never)?.length ?? 0;
}

function ownPieceActivities(ctx: Parameters<TacticDetector['detect']>[0]): number[] {
  const mover = toColorName(ctx.mover);
  return ctx.before
    .board()
    .flat()
    .filter((piece) => piece !== null && toColorName(piece.color) === mover && piece.type !== 'p' && piece.type !== 'k')
    .map((piece) => ctx.beforeAttackMap.controlledBy.get(piece!.square)?.length ?? 0);
}
