import { see } from '../../see.js';
import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation, lossConfirmed } from '../eval-verdict.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { destinationSquare, isCaptureSan } from './shared.js';

/**
 * §II.C BV-04 "Attacker–defender counting failure" — counts exchanges on
 * one square incorrectly before deeper calculation.
 *
 * Opportunity: the move played is a capture whose cheap one-ply `favorable`
 * flag (already stored on `checksCapturesThreats`) disagrees with the sign
 * of a full static exchange evaluation on the same square — the naive
 * attacker/defender count and the real exchange point different ways.
 * Failure: the full exchange actually loses material (SEE < 0) and the
 * eval confirms the loss. An even trade (SEE 0) the count called
 * favorable, or a good capture the count called unfavorable, is not one.
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

    const failed = fullSee < 0 && lossConfirmed(ctx);
    const detail = `played ${ctx.moveSan} as ${playedCapture.favorable ? 'favorable' : 'unfavorable'} by one-ply count, but the full exchange on ${destination} is ${exchangeLabel(fullSee)} (SEE ${fullSee})`;
    return buildEvalObservation(ctx, 'BV-04', 'B', failed, detail);
  }
};

function exchangeLabel(fullSee: number): string {
  if (fullSee > 0) return 'favorable';
  return fullSee < 0 ? 'losing' : 'even';
}
