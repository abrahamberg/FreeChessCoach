import { see } from '../../see.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation, destinationSquare, isCaptureSan } from './shared.js';

/**
 * §II.C BV-04 "Attacker–defender counting failure" — counts exchanges on
 * one square incorrectly before deeper calculation. Fires when the move
 * played is a capture whose cheap one-ply `favorable` flag (already stored
 * on `checksCapturesThreats`) disagrees with the sign of a full static
 * exchange evaluation on the same square — the mover's naive attacker/
 * defender count and the real exchange value point different directions.
 */
export const bv04AttackerDefenderCountingFailure: DiagnosticDetector = {
  code: 'BV-04',
  direction: 'B',
  priority: 120,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    if (!isCaptureSan(ctx.moveSan)) return null;

    const playedCapture = ctx.checksCapturesThreats?.captures.moves.find((move) => move.moveSan === ctx.moveSan);
    if (!playedCapture) return null;

    const destination = destinationSquare(ctx.fenBefore, ctx.moveSan);
    if (!destination) return null;

    const fullSee = see(ctx.fenBefore, destination, ctx.mover);
    if (playedCapture.favorable === fullSee > 0) return null;

    const detail = `played ${ctx.moveSan} as ${playedCapture.favorable ? 'favorable' : 'unfavorable'} by one-ply count, but the full exchange on ${destination} is ${fullSee > 0 ? 'favorable' : 'unfavorable'} (SEE ${fullSee})`;
    return buildQualityObservation(ctx, 'BV-04', 'B', detail);
  }
};
