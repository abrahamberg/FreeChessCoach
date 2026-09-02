import { see } from '../../see.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation, destinationSquare, opponentOf } from './shared.js';

/**
 * §II.D MS-08 "Final destination-safety omission" — does not complete a
 * final one-ply verification of the chosen move. Fires when a full static
 * exchange evaluation on the move's own destination square, computed for
 * the opponent (i.e. "can the opponent profitably capture what just landed
 * here"), is positive — the spec's "SEE < 0 on the destination square" from
 * the mover's perspective.
 */
export const ms08DestinationSafetyOmission: DiagnosticDetector = {
  code: 'MS-08',
  direction: 'N',
  priority: 80,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const destination = destinationSquare(ctx.fenBefore, ctx.moveSan);
    if (!destination) return null;

    const seeForOpponent = see(ctx.fenAfter, destination, opponentOf(ctx.mover));
    if (seeForOpponent <= 0) return null;

    const detail = `landed on ${destination}, which the opponent can profitably capture (SEE ${seeForOpponent} for the opponent)`;
    return buildQualityObservation(ctx, 'MS-08', 'N', detail);
  }
};
