import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { detectOpponentThreatScan } from './opponent-threat-scan.js';

/**
 * §II.D MS-01 "Opponent-check scan omission" — fails to list the opponent's
 * legal checks before moving. §4.4's "theme objectively present" is a
 * *dangerous* opponent check (mate, or a check that also wins a piece —
 * `threat-inventory.ts`), not any legal check; a failure is that check left
 * standing, carried out by the engine's refutation, with an eval-confirmed
 * loss. See `detectOpponentThreatScan`.
 */
export const ms01OpponentCheckScanOmission: DiagnosticDetector = {
  code: 'MS-01',
  direction: 'D',
  priority: 110,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return detectOpponentThreatScan(ctx, 'MS-01', 'check');
  }
};
