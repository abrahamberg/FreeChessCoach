import type { PositionFeatures } from '@freechesscoach/shared';
import { computePositionFeatures } from '../../position-features.js';
import type { PlyDiagnosticContext } from '../context.js';

type PieceEntry = PositionFeatures['hangingPieces'][number];

/** The position features after this move: the stored `features` (computed
 * from `fenAfter` by `classify.ts`), or the same computation when a move
 * predates them. */
export function postMoveFeatures(ctx: Pick<PlyDiagnosticContext, 'features' | 'fenAfter'>): PositionFeatures {
  return ctx.features ?? computePositionFeatures(ctx.fenAfter);
}

/** The squares of the mover's own pieces in a feature list (hanging,
 * under-defended, …). */
export function ownSquares(pieces: readonly PieceEntry[], mover: 'white' | 'black'): string[] {
  return pieces.filter((piece) => piece.color === mover).map((piece) => piece.square);
}
