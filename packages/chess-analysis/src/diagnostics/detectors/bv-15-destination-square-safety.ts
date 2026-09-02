import { see } from '../../see.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation, destinationSquare, opponentOf } from './shared.js';

/**
 * §II.C BV-15 "Destination-square safety blindness" — does not verify
 * whether the moved piece is safe on arrival. Same underlying SEE check as
 * `MS-08` (a board-vision-layer diagnosis of the same fact `MS-08` names at
 * the scan/process layer — §I.3 causal precedence, resolved by Task 54.3,
 * not by keeping only one of the two).
 */
export const bv15DestinationSquareSafetyBlindness: DiagnosticDetector = {
  code: 'BV-15',
  direction: 'B',
  priority: 160,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const destination = destinationSquare(ctx.fenBefore, ctx.moveSan);
    if (!destination) return null;

    const seeForOpponent = see(ctx.fenAfter, destination, opponentOf(ctx.mover));
    if (seeForOpponent <= 0) return null;

    const detail = `landed on ${destination}, which the opponent can profitably capture (SEE ${seeForOpponent} for the opponent)`;
    return buildQualityObservation(ctx, 'BV-15', 'B', detail);
  }
};
