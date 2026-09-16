import { computeCctOpportunities } from '../cct-opportunities.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.D MS-03 "Opponent-direct-threat omission" — misses mate, promotion,
 * trapping, or another direct one-move threat. Mate/checks are MS-01's
 * territory; this detector covers the remaining case `computeCctOpportunities`
 * models directly — a quiet opponent move that newly attacks a mover piece
 * (`opponentThreats`). Promotion/trapping threats specifically aren't
 * separately tracked by the CCT primitive; this vertical slice covers the
 * "newly attacks something" case only.
 */
export const ms03OpponentThreatScanOmission: DiagnosticDetector = {
  code: 'MS-03',
  direction: 'D',
  priority: 130,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const { opponentThreats } = computeCctOpportunities(ctx);
    if (opponentThreats.length === 0) return null;

    const detail = `left the opponent ${opponentThreats.length} direct threat${opponentThreats.length > 1 ? 's' : ''} available: ${opponentThreats.map((move) => move.moveSan).join(', ')}`;
    return buildQualityObservation(ctx, 'MS-03', 'D', detail);
  }
};
