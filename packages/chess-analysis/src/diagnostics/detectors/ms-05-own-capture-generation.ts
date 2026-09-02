import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.D MS-05 "Own-capture generation omission" — misses immediately
 * profitable captures. `computeCctOpportunities`' `unplayedProfitableCaptures`
 * already applies the `favorable`-or-SEE>0 profitability filter.
 */
export const ms05OwnCaptureGenerationOmission: DiagnosticDetector = {
  code: 'MS-05',
  direction: 'O',
  priority: 50,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { unplayedProfitableCaptures } = computeCctOpportunities(ctx);
    if (unplayedProfitableCaptures.length === 0) return null;

    const detail = `had ${unplayedProfitableCaptures.length} profitable capture${unplayedProfitableCaptures.length > 1 ? 's' : ''} available and did not play one: ${unplayedProfitableCaptures.map((move) => move.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'MS-05', 'O', detail);
  }
};
