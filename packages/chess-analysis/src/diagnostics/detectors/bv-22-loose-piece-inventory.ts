import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation } from '../eval-verdict.js';
import { opponentThreatsAfter, realizedThreats, threatsOn } from '../threat-inventory.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownSquares, postMoveFeatures } from './own-piece-squares.js';

/**
 * §II.C BV-22 "Loose-piece inventory failure" — cannot consistently
 * identify all undefended or tactically loose pieces. Broader than `MS-14`
 * (one piece, punished within two plies): the opportunity is the position
 * after this move leaving the mover with *multiple* simultaneous loose
 * pieces (`features.underDefendedPieces`). It fails only when the opponent
 * actually wins one of them — a dangerous capture on a loose square that
 * the engine's refutation carries out, with an eval-confirmed loss.
 */
export const bv22LoosePieceInventoryFailure: DiagnosticDetector = {
  code: 'BV-22',
  direction: 'B',
  priority: 170,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const loose = ownSquares(postMoveFeatures(ctx).underDefendedPieces, ctx.mover);
    if (loose.length < 2) return null;

    const realised = realizedThreats(ctx, threatsOn(opponentThreatsAfter(ctx, 'capture'), loose));
    const base = `left ${loose.length} simultaneous loose pieces: ${loose.join(', ')}`;
    const detail = realised.length > 0 ? `${base}; lost one to ${realised.map((threat) => threat.moveSan).join(' / ')}` : base;
    return buildEvalObservation(ctx, 'BV-22', 'B', realised.length > 0, detail);
  }
};
