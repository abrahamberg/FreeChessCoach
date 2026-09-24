import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildEvalObservation, lossConfirmed } from '../eval-verdict.js';
import { destinationSquare, isCaptureSan } from './shared.js';

/**
 * §II.D MS-07 "Automatic-recapture reflex" — recaptures without checking
 * intermediate or stronger moves. Also `TA-27` zwischenzug; Task 54.3's
 * precedence pass resolves that overlap, not this detector.
 *
 * Needs `ctx.previousMove` (the opponent's move immediately before this
 * one) to know which square was "just captured" — undefined for the game's
 * first ply or when the caller only has this one move in hand, in which
 * case this detector finds no opportunity rather than guessing.
 *
 * Failed only when the eval confirms a loss (`lossConfirmed`) *and* the
 * engine's best move was one of those intermediate moves — a recapture that
 * was itself best, or a loss that came from elsewhere, is not the reflex.
 */
export const ms07AutomaticRecaptureReflex: DiagnosticDetector = {
  code: 'MS-07',
  direction: 'N',
  priority: 170,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const previous = ctx.previousMove;
    if (!previous?.fenBefore || !isCaptureSan(previous.moveSan)) return null;

    const justCapturedSquare = destinationSquare(previous.fenBefore, previous.moveSan);
    if (!justCapturedSquare) return null;

    const playedDestination = destinationSquare(ctx.fenBefore, ctx.moveSan);
    if (playedDestination !== justCapturedSquare || !isCaptureSan(ctx.moveSan)) return null;

    const { unplayedProfitableCaptures, unplayedChecks } = computeCctOpportunities(ctx);
    const strongerIntermediate = [...unplayedProfitableCaptures, ...unplayedChecks].filter(
      (move) => move.to !== justCapturedSquare
    );
    if (strongerIntermediate.length === 0) return null;

    const intermediateSans = strongerIntermediate.map((move) => move.moveSan);
    const missed = missedIntermediate(ctx, intermediateSans);
    const detail = missed
      ? `recaptured on ${justCapturedSquare} instead of the intermediate move ${missed}`
      : `recaptured on ${justCapturedSquare} with ${intermediateSans.join(', ')} also available`;
    return buildEvalObservation(ctx, 'MS-07', 'N', missed !== null, detail);
  }
};

/** The engine's best move, when it was one of the intermediate moves and
 * the recapture cost meaningful value against it; otherwise null. */
function missedIntermediate(ctx: PlyDiagnosticContext, intermediateSans: readonly string[]): string | null {
  const best = ctx.bestMoveSan;
  if (best === undefined || !intermediateSans.includes(best)) return null;
  return lossConfirmed(ctx) ? best : null;
}
