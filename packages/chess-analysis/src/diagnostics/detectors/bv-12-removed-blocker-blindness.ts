import type { Color } from 'chess.js';
import { discoveredAttackDetail } from '../../tactic-discovered.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

function opponentColor(mover: 'white' | 'black'): Color {
  return mover === 'white' ? 'b' : 'w';
}

/**
 * §II.C BV-12 "Removed-blocker blindness" — misses a newly opened line
 * after a move or capture. `discoveredAttackDetail` already finds "which of
 * `mover`'s pieces gained a newly-revealed attack as a side effect of this
 * move" (built for `TA-16`'s offensive discovered attack); calling it with
 * the *opponent's* color finds the mirror case this code needs — the
 * mover's own move vacated a square and, as a side effect, exposed one of
 * the mover's own pieces to a newly-revealed opponent attack.
 */
export const bv12RemovedBlockerBlindness: DiagnosticDetector = {
  code: 'BV-12',
  direction: 'B',
  priority: 140,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const hit = discoveredAttackDetail(ctx.fenBefore, ctx.moveSan, opponentColor(ctx.mover));
    if (!hit) return null;

    const detail = `${ctx.moveSan} opened a line for the opponent's ${hit.pieceType} on ${hit.piece}, newly attacking ${hit.revealed}`;
    return buildQualityObservation(ctx, 'BV-12', 'B', detail);
  }
};
