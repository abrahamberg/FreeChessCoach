import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation, lossConfirmed } from '../eval-verdict.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownSquares, postMoveFeatures } from './own-piece-squares.js';
import { destinationSquare, isCaptureSan } from './shared.js';

/**
 * §II.D MS-14 "Loose-piece scan omission" — does not check the status of
 * loose pieces before committing to a move. A mover piece is "loose" here
 * when `features.underDefendedPieces` flags it after this move. The
 * opportunity is any such piece; it fails only when one is actually
 * captured within the next two plies (`ctx.nextMoves`) *and* the eval
 * confirms the move lost something — an even trade on a loose square is
 * not a punished omission.
 *
 * Needs `ctx.nextMoves` (the following up to two plies) to check whether
 * the loose piece was punished — undefined near the end of a game or when
 * the caller only has this one move in hand, in which case this detector
 * finds no opportunity rather than guessing.
 */
export const ms14LoosePieceScanOmission: DiagnosticDetector = {
  code: 'MS-14',
  direction: 'N',
  priority: 190,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const loose = ownSquares(postMoveFeatures(ctx).underDefendedPieces, ctx.mover);
    if (loose.length === 0) return null;

    const nextMoves = ctx.nextMoves ?? [];
    if (nextMoves.length === 0) return null;

    const capturedSquare = loose.find((square) => nextMoves.some((next) => capturesOn(next, square)));
    const failed = capturedSquare !== undefined && lossConfirmed(ctx);
    return buildEvalObservation(ctx, 'MS-14', 'N', failed, detailFor(loose, capturedSquare, failed));
  }
};

function capturesOn(next: ClassifiedMoveDto, square: string): boolean {
  if (!next.fenBefore || !isCaptureSan(next.moveSan)) return false;
  return destinationSquare(next.fenBefore, next.moveSan) === square;
}

function detailFor(loose: readonly string[], capturedSquare: string | undefined, failed: boolean): string {
  if (failed) return `left a loose piece on ${capturedSquare}, captured within two plies at a real cost`;
  if (capturedSquare) return `left a loose piece on ${capturedSquare}, captured within two plies without losing anything (an even trade)`;
  return `left ${loose.length} loose piece${loose.length > 1 ? 's' : ''} (${loose.join(', ')}), not punished within two plies`;
}
