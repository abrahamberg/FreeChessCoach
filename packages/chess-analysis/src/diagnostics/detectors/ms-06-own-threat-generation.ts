import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.D MS-06 "Own-direct-threat generation omission" — considers checks
 * and captures but not forcing threats. The mover's own pre-move quiet
 * threats (`unplayedThreats`) the mover didn't play.
 */
export const ms06OwnThreatGenerationOmission: DiagnosticDetector = {
  code: 'MS-06',
  direction: 'O',
  priority: 160,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { unplayedThreats } = computeCctOpportunities(ctx);
    if (unplayedThreats.length === 0) return null;

    const detail = `had ${unplayedThreats.length} forcing threat${unplayedThreats.length > 1 ? 's' : ''} available and did not play one: ${unplayedThreats.map((move) => move.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'MS-06', 'O', detail);
  }
};
