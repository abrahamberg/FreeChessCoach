import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.D MS-04 "Own-check generation omission" — misses useful checks
 * visible without deep calculation. The mover's own pre-move CCT scan had
 * at least one check the mover didn't play.
 */
export const ms04OwnCheckGenerationOmission: DiagnosticDetector = {
  code: 'MS-04',
  direction: 'O',
  priority: 40,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { unplayedChecks } = computeCctOpportunities(ctx);
    if (unplayedChecks.length === 0) return null;

    const detail = `had ${unplayedChecks.length} check${unplayedChecks.length > 1 ? 's' : ''} available and did not play one: ${unplayedChecks.map((move) => move.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'MS-04', 'O', detail);
  }
};
