import {
  addFocusFailureMoments,
  type CandidateMoment,
  type ClassifiedMove,
  type FocusObservation
} from '@freechesscoach/chess-analysis';
import type { CoachingPlan, DiagnosisCodeId } from '@freechesscoach/shared';

/**
 * The candidate moments a game's lesson plan is made from: the ones the
 * analysis found (by what a move cost), plus the moves where one of the
 * student's focus-area habits failed. The habits join here, when the plan is
 * made, not when the game is analysed: focus areas are created by a rebuild
 * that runs after the analysis, so a join at analysis time would be stale.
 */
export function planCandidateMoments(
  stored: readonly CandidateMoment[],
  moves: readonly ClassifiedMove[],
  observations: readonly FocusObservation[],
  focusCodes: ReadonlySet<DiagnosisCodeId>
): CandidateMoment[] {
  return addFocusFailureMoments(stored, observations, focusCodes, studentPlies(moves));
}

/** The plies the student played. */
export function studentPlies(moves: readonly ClassifiedMove[]): Set<number> {
  return new Set(moves.filter((move) => move.isUserMove).map((move) => move.ply));
}

/**
 * A plan's moments must be moves the student played: the planner may pick any
 * ply, and a moment on the opponent's move asks the student about a decision
 * that was never theirs. If none is left the plan is kept as it was, rather
 * than stored with no moments at all.
 */
export function keepStudentMoments(plan: CoachingPlan, userPlies: ReadonlySet<number>): CoachingPlan {
  const moments = plan.moments.filter((moment) => userPlies.has(moment.ply));
  return moments.length > 0 ? { ...plan, moments } : plan;
}
