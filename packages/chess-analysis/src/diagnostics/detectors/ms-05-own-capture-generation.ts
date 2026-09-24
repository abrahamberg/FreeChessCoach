import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownChanceObservation, ownWinningCaptureSans } from './own-chance.js';

/**
 * §II.D MS-05 "Own-capture generation omission" — misses immediately
 * profitable captures. The chance set is the mover's own captures whose
 * exchange wins at least `CONFIG.evalWitness.minThreatSeeCp` (the played
 * one included); the verdict is `own-chance.ts`'s real-chance rule.
 */
export const ms05OwnCaptureGenerationOmission: DiagnosticDetector = {
  code: 'MS-05',
  direction: 'O',
  priority: 150,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return ownChanceObservation(ctx, 'MS-05', ownWinningCaptureSans(ctx), 'the capture');
  }
};
