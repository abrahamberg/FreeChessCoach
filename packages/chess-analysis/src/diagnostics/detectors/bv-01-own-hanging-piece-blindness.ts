import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.C BV-01 "Own hanging-piece blindness" — repeatedly leaves a piece
 * freely capturable and misses its status in static tests. Fires when this
 * move's resulting position (`ctx.features`, already post-move) leaves at
 * least one of the mover's own pieces hanging.
 */
export const bv01OwnHangingPieceBlindness: DiagnosticDetector = {
  code: 'BV-01',
  direction: 'D',
  priority: 100,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const ownHanging = (ctx.features?.hangingPieces ?? []).filter((piece) => piece.color === ctx.mover);
    if (ownHanging.length === 0) return null;

    const detail = `left ${ownHanging.length} own piece${ownHanging.length > 1 ? 's' : ''} hanging: ${ownHanging.map((p) => p.square).join(', ')}`;
    return buildQualityObservation(ctx, 'BV-01', 'D', detail);
  }
};
