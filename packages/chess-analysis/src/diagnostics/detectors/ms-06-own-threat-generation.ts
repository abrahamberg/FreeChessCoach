import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownChanceObservation, ownThreatSans } from './own-chance.js';

/**
 * §II.D MS-06 "Own-direct-threat generation omission" — considers checks
 * and captures but not forcing threats. The chance set is the mover's own
 * pre-move quiet threats (the played one included); the verdict is
 * `own-chance.ts`'s real-chance rule.
 */
export const ms06OwnThreatGenerationOmission: DiagnosticDetector = {
  code: 'MS-06',
  direction: 'O',
  priority: 160,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return ownChanceObservation(ctx, 'MS-06', ownThreatSans(ctx), 'the threat');
  }
};
