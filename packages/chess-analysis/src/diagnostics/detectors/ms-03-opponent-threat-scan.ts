import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { opponentDirectThreatsBefore } from '../threat-inventory.js';
import { detectOpponentThreatScan } from './opponent-threat-scan.js';

/**
 * §II.D MS-03 "Opponent-direct-threat omission" — misses mate, promotion,
 * trapping, or another direct one-move threat. Mate/checks are MS-01's
 * territory. The opportunity is a *direct* threat the opponent already held
 * before the move: a mate in one or a surviving promotion if the mover passed
 * (`opponentDirectThreatsBefore`), or a quiet attack left standing after the
 * move that the refutation carried out. A failure is only the latter, with an
 * eval-confirmed loss. Trapping threats aren't separately tracked. See
 * `detectOpponentThreatScan`.
 */
export const ms03OpponentThreatScanOmission: DiagnosticDetector = {
  code: 'MS-03',
  direction: 'D',
  priority: 130,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return detectOpponentThreatScan(ctx, 'MS-03', 'threat', opponentDirectThreatsBefore(ctx));
  }
};
