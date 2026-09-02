import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildObservation, destinationSquare, isCaptureSan } from './shared.js';

/**
 * §II.D MS-07 "Automatic-recapture reflex" — recaptures without checking
 * intermediate or stronger moves. Also `TA-27` zwischenzug; Task 54.3's
 * precedence pass resolves that overlap, not this detector.
 *
 * Needs `ctx.previousMove` (the opponent's move immediately before this
 * one) to know which square was "just captured" — undefined for the game's
 * first ply or when the caller only has this one move in hand, in which
 * case this detector finds no opportunity rather than guessing.
 */
export const ms07AutomaticRecaptureReflex: DiagnosticDetector = {
  code: 'MS-07',
  direction: 'N',
  priority: 70,
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

    const detail = `recaptured on ${justCapturedSquare} instead of the intermediate move ${strongerIntermediate[0]!.moveSan}`;
    return buildObservation(ctx, 'MS-07', 'N', true, 'meaningful', detail);
  }
};
