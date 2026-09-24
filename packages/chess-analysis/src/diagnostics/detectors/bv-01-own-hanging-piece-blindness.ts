import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation } from '../eval-verdict.js';
import { opponentThreatsAfter, opponentThreatsBefore, realizedThreats, threatsOn, type Threat } from '../threat-inventory.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownSquares, postMoveFeatures } from './own-piece-squares.js';

/**
 * §II.C BV-01 "Own hanging-piece blindness" — repeatedly leaves a piece
 * freely capturable and misses its status in static tests.
 *
 * Opportunity: one of the mover's pieces was hanging *before* the move and
 * the opponent could win it outright (a dangerous capture), or a capture
 * of a piece left hanging *after* the move was actually realised.
 * Failure: only the latter — the engine's refutation takes a post-move
 * hanging piece and the eval confirms the loss. A blunder elsewhere on
 * the board, with the hanging piece left alone, is not a BV-01 failure.
 */
export const bv01OwnHangingPieceBlindness: DiagnosticDetector = {
  code: 'BV-01',
  direction: 'D',
  priority: 100,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const threatenedBefore = threatsOn(
      opponentThreatsBefore(ctx, 'capture'),
      ownSquares(ctx.featuresBefore.hangingPieces, ctx.mover)
    );
    const realised = realizedThreats(
      ctx,
      threatsOn(opponentThreatsAfter(ctx, 'capture'), ownSquares(postMoveFeatures(ctx).hangingPieces, ctx.mover))
    );
    if (threatenedBefore.length === 0 && realised.length === 0) return null;

    const failed = realised.length > 0;
    const detail = failed ? lostDetail(realised) : keptDetail(threatenedBefore);
    return buildEvalObservation(ctx, 'BV-01', 'D', failed, detail);
  }
};

function lostDetail(realised: readonly Threat[]): string {
  return `left ${targetsOf(realised)} hanging and lost it to ${realised.map((threat) => threat.moveSan).join(' / ')}`;
}

function keptDetail(threatenedBefore: readonly Threat[]): string {
  return `had ${targetsOf(threatenedBefore)} hanging before the move and did not lose it`;
}

function targetsOf(threats: readonly Threat[]): string {
  return [...new Set(threats.map((threat) => threat.target))].join(', ');
}
