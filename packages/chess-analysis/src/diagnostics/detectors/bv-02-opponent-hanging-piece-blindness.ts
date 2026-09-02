import { computePositionFeatures } from '../../position-features.js';
import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.C BV-02 "Opponent hanging-piece blindness" — fails to take free enemy
 * pieces despite adequate time and no complication. Narrower than MS-05
 * (any profitable capture): this fires only when the unplayed capture's
 * target had zero defenders before the move (`computePositionFeatures`
 * on `fenBefore` — a pure, engine-free recomputation, not stored on the
 * move itself since that field only holds the post-move features).
 */
export const bv02OpponentHangingPieceBlindness: DiagnosticDetector = {
  code: 'BV-02',
  direction: 'O',
  priority: 110,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { unplayedProfitableCaptures } = computeCctOpportunities(ctx);
    if (unplayedProfitableCaptures.length === 0) return null;

    const hangingSquares = new Set(
      computePositionFeatures(ctx.fenBefore)
        .hangingPieces.filter((piece) => piece.color !== ctx.mover)
        .map((piece) => piece.square)
    );
    const unplayedFree = unplayedProfitableCaptures.filter((move) => hangingSquares.has(move.to));
    if (unplayedFree.length === 0) return null;

    const detail = `left ${unplayedFree.length} free enemy piece${unplayedFree.length > 1 ? 's' : ''} untaken: ${unplayedFree.map((m) => m.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'BV-02', 'O', detail);
  }
};
