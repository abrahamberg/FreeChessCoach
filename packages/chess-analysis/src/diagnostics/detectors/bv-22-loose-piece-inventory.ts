import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.C BV-22 "Loose-piece inventory failure" — cannot consistently
 * identify all undefended or tactically loose pieces. Broader than `MS-14`
 * (one piece, punished within two plies): this fires whenever the position
 * after this move leaves the mover with *multiple* simultaneous loose
 * pieces (`features.underDefendedPieces`) — a full-inventory failure, not
 * a single missed one, and doesn't require forward-looking punishment data.
 */
export const bv22LoosePieceInventoryFailure: DiagnosticDetector = {
  code: 'BV-22',
  direction: 'B',
  priority: 170,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const ownLoosePieces = (ctx.features?.underDefendedPieces ?? []).filter((piece) => piece.color === ctx.mover);
    if (ownLoosePieces.length < 2) return null;

    const detail = `left ${ownLoosePieces.length} simultaneous loose pieces: ${ownLoosePieces.map((p) => p.square).join(', ')}`;
    return buildQualityObservation(ctx, 'BV-22', 'B', detail);
  }
};
