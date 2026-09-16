import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.D MS-02 "Opponent-capture scan omission" — omits immediate profitable
 * captures the opponent has. Unlike `computeCctOpportunities`'
 * `opponentCaptures` (deliberately unfiltered — see its doc comment), this
 * detector applies the family's own `favorable` filter itself: MS-02 is
 * specifically about *profitable* captures, not every capture that exists.
 */
export const ms02OpponentCaptureScanOmission: DiagnosticDetector = {
  code: 'MS-02',
  direction: 'D',
  priority: 120,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { opponentCaptures } = computeCctOpportunities(ctx);
    const profitable = opponentCaptures.filter((move) => move.favorable);
    if (profitable.length === 0) return null;

    const detail = `left the opponent ${profitable.length} profitable capture${profitable.length > 1 ? 's' : ''} available: ${profitable.map((move) => move.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'MS-02', 'D', detail);
  }
};
