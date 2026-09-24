import { Chess, type Square } from 'chess.js';
import type { DiagnosisCodeId, Direction } from '@freechesscoach/shared';
import { buildAttackMap } from '../../attack-map.js';
import { CONFIG } from '../../config.js';
import { see } from '../../see.js';
import { attackersOf } from '../../tactic-board-facts.js';
import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation, lossConfirmed } from '../eval-verdict.js';
import { refutationWinsOn, walkedRefutation } from '../threat-inventory.js';
import type { DiagnosticObservation } from '../types.js';
import { destinationSquare, opponentOf } from './shared.js';

const { minThreatSeeCp: MIN_THREAT_SEE_CP } = CONFIG.evalWitness;

/**
 * The shared shape of MS-08 and BV-15 (the same fact named at the
 * scan/process layer and at the board-vision layer):
 * - opportunity: the moved piece lands on a square the opponent attacks;
 * - failure: the opponent wins it there (SEE ≥ `minThreatSeeCp`), the eval
 *   confirms the loss, and — when the engine's refutation is known — that
 *   line actually captures on the destination.
 */
export function detectDestinationSafety(
  ctx: PlyDiagnosticContext,
  code: DiagnosisCodeId,
  direction: Direction
): DiagnosticObservation | null {
  const destination = destinationSquare(ctx.fenBefore, ctx.moveSan);
  if (!destination || !isAttackedByOpponent(ctx, destination)) return null;

  const seeForOpponent = see(ctx.fenAfter, destination, opponentOf(ctx.mover));
  const failed = seeForOpponent >= MIN_THREAT_SEE_CP && lossConfirmed(ctx) && refutationTakes(ctx, destination);
  return buildEvalObservation(ctx, code, direction, failed, detailFor(destination, seeForOpponent, failed));
}

function isAttackedByOpponent(ctx: PlyDiagnosticContext, square: Square): boolean {
  const opponent = ctx.mover === 'white' ? 'b' : 'w';
  return attackersOf(buildAttackMap(new Chess(ctx.fenAfter)), square, opponent).length > 0;
}

function refutationTakes(ctx: PlyDiagnosticContext, square: Square): boolean {
  const walked = walkedRefutation(ctx);
  return walked === null || refutationWinsOn(ctx, walked, square);
}

function detailFor(destination: Square, seeForOpponent: number, failed: boolean): string {
  if (failed) return `landed on ${destination}, where the opponent won the piece (SEE ${seeForOpponent} for the opponent)`;
  if (seeForOpponent >= MIN_THREAT_SEE_CP) {
    return `landed on ${destination}, capturable (SEE ${seeForOpponent} for the opponent), but that did not cost anything`;
  }
  return `landed on ${destination}, attacked by the opponent but safe (SEE ${seeForOpponent} for the opponent)`;
}
