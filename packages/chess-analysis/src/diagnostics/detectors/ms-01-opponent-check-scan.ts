import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.D MS-01 "Opponent-check scan omission" — fails to list the opponent's
 * legal checks before moving. §4.4's "theme objectively present" is the
 * opponent having at least one check available after this move; whether it
 * mattered is `ctx.quality` (already the engine's full-search verdict on
 * this exact position, not a re-scan of just this one factor).
 */
export const ms01OpponentCheckScanOmission: DiagnosticDetector = {
  code: 'MS-01',
  direction: 'D',
  priority: 110,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { opponentChecks } = computeCctOpportunities(ctx);
    if (opponentChecks.length === 0) return null;

    const detail = `left the opponent ${opponentChecks.length} check${opponentChecks.length > 1 ? 's' : ''} available: ${opponentChecks.map((move) => move.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'MS-01', 'D', detail);
  }
};
