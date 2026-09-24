import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { detectDestinationSafety } from './destination-safety.js';

/**
 * §II.D MS-08 "Final destination-safety omission" — does not complete a
 * final one-ply verification of the chosen move. An opportunity is the
 * moved piece landing on a square the opponent attacks; a failure is the
 * opponent actually winning it there (the spec's "SEE < 0 on the
 * destination square" from the mover's side) with an eval-confirmed loss.
 * See `detectDestinationSafety`.
 */
export const ms08DestinationSafetyOmission: DiagnosticDetector = {
  code: 'MS-08',
  direction: 'N',
  priority: 180,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return detectDestinationSafety(ctx, 'MS-08', 'N');
  }
};
