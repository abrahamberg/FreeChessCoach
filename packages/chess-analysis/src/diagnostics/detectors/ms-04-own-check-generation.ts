import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownChanceObservation, ownCheckSans } from './own-chance.js';

/**
 * §II.D MS-04 "Own-check generation omission" — misses useful checks
 * visible without deep calculation. An opportunity only when one of the
 * mover's own checks (the played one included) is a real chance by the
 * engine's lines; a failure only when it was missed and the eval confirms
 * the cost (`own-chance.ts`).
 */
export const ms04OwnCheckGenerationOmission: DiagnosticDetector = {
  code: 'MS-04',
  direction: 'O',
  priority: 140,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return ownChanceObservation(ctx, 'MS-04', ownCheckSans(ctx), 'the check');
  }
};
