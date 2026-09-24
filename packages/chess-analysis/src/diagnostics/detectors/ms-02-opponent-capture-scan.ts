import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { detectOpponentThreatScan } from './opponent-threat-scan.js';

/**
 * §II.D MS-02 "Opponent-capture scan omission" — omits immediate profitable
 * captures the opponent has. "Profitable" is a whole-exchange SEE of at
 * least `CONFIG.evalWitness.minThreatSeeCp` (`threat-inventory.ts`); a
 * failure is such a capture left standing, carried out by the engine's
 * refutation, with an eval-confirmed loss. See `detectOpponentThreatScan`.
 */
export const ms02OpponentCaptureScanOmission: DiagnosticDetector = {
  code: 'MS-02',
  direction: 'D',
  priority: 120,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return detectOpponentThreatScan(ctx, 'MS-02', 'capture');
  }
};
