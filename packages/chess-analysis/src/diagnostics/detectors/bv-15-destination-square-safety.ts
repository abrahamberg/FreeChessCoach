import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { detectDestinationSafety } from './destination-safety.js';

/**
 * §II.C BV-15 "Destination-square safety blindness" — does not verify
 * whether the moved piece is safe on arrival. Same verdict as `MS-08` (a
 * board-vision-layer diagnosis of the same fact `MS-08` names at the
 * scan/process layer — §I.3 causal precedence, resolved by Task 54.3, not
 * by keeping only one of the two). See `detectDestinationSafety`.
 */
export const bv15DestinationSquareSafetyBlindness: DiagnosticDetector = {
  code: 'BV-15',
  direction: 'B',
  priority: 160,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return detectDestinationSafety(ctx, 'BV-15', 'B');
  }
};
