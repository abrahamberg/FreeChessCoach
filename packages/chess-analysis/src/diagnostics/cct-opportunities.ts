import type { Square } from 'chess.js';
import type { ChecksCapturesThreats } from '@freechesscoach/shared';
import { see } from '../see.js';
import type { PlyDiagnosticContext } from './context.js';

type CaptureOpportunity = ChecksCapturesThreats['captures']['moves'][number];
type CheckOpportunity = ChecksCapturesThreats['checks']['moves'][number];
type ThreatOpportunity = ChecksCapturesThreats['threats']['moves'][number];

/**
 * §II.D primitive every `MS-*` detector is built on (Task 53.2), aggregated
 * from the ply's already-stored `checksCapturesThreats` and the
 * `opponentChecksCapturesThreats` `context.ts` computes on `fenAfter` — no
 * new engine calls, no new board replay beyond the one-ply SEE check below.
 */
export interface CctOpportunities {
  /** The mover's own pre-move captures that were profitable and not the move
   * actually played — what MS-05 asks whether the mover generated. */
  unplayedProfitableCaptures: CaptureOpportunity[];
  /** The mover's own pre-move checks not the move actually played — what
   * MS-04 asks whether the mover generated. */
  unplayedChecks: CheckOpportunity[];
  /** Every check the opponent can play next, after the mover's move — what
   * MS-01 asks whether the mover scanned for. */
  opponentChecks: CheckOpportunity[];
  /** Every capture the opponent can play next — what MS-02 asks whether the
   * mover scanned for. Unfiltered by profitability: whether an opponent
   * capture is worth taking is the opponent's decision, not a precondition
   * for the mover having had to notice it existed. */
  opponentCaptures: CaptureOpportunity[];
  /** Every quiet move that newly threatens a mover piece, after the mover's
   * move — what MS-03 asks whether the mover scanned for. */
  opponentThreats: ThreatOpportunity[];
}

/**
 * A capture is profitable when the cheap one-ply `favorable` flag already
 * says so, or when a full static-exchange evaluation on the destination
 * square disagrees with that heuristic (e.g. a second defender that
 * `favorable`'s single-ply check can't see makes the exchange favorable
 * once carried to its conclusion).
 */
function isProfitableCapture(
  move: CaptureOpportunity,
  fenBefore: string,
  mover: 'white' | 'black'
): boolean {
  return move.favorable || see(fenBefore, move.to as Square, mover) > 0;
}

export function computeCctOpportunities(context: PlyDiagnosticContext): CctOpportunities {
  const ownCct = context.checksCapturesThreats;
  const opponentCct = context.opponentChecksCapturesThreats;

  const unplayedProfitableCaptures = (ownCct?.captures.moves ?? [])
    .filter((move) => move.moveSan !== context.moveSan)
    .filter((move) => isProfitableCapture(move, context.fenBefore, context.mover));
  const unplayedChecks = (ownCct?.checks.moves ?? []).filter((move) => move.moveSan !== context.moveSan);

  return {
    unplayedProfitableCaptures,
    unplayedChecks,
    opponentChecks: opponentCct.checks.moves,
    opponentCaptures: opponentCct.captures.moves,
    opponentThreats: opponentCct.threats.moves
  };
}
