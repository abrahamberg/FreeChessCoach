import type { DiagnosisCodeId, Severity } from '@freechesscoach/shared';
import { KIND_PRIORITY, type CandidateMoment } from './critical-moments.js';

/**
 * Moves where one of the student's focus-area habits failed, as candidate
 * moments for the lesson plan. `findCandidateMoments` picks a move for what it
 * cost; a missed count of attackers or a loose-piece scan skipped in a decided
 * game costs nothing, is rated good, and was never picked, although it is the
 * very habit the session is about. Read from the diagnostic observations
 * (`failed`), which do not depend on the eval.
 */
export interface FocusObservation {
  ply: number;
  code: DiagnosisCodeId;
  failed: boolean;
  severity: Severity;
  reachability: number;
}

/** At most this many moves are added to a game's candidates: a session walks
 * four to eight moments, and the habits must not crowd the mistakes out. */
export const MAX_FOCUS_FAILURE_MOMENTS = 3;

const SEVERITY_RANK: Record<Severity, number> = { decisive: 3, major: 2, meaningful: 1, minor: 0 };

/**
 * `existing` is what `findCandidateMoments` found; a ply it already holds under
 * a stronger kind keeps that kind (and gains the habit's code, so the planner
 * can say why it matters twice over). The student's own plies only: `userPlies`
 * is the set of plies the student played.
 */
export function addFocusFailureMoments(
  existing: readonly CandidateMoment[],
  observations: readonly FocusObservation[],
  focusCodes: ReadonlySet<DiagnosisCodeId>,
  userPlies: ReadonlySet<number>,
  maxNew = MAX_FOCUS_FAILURE_MOMENTS
): CandidateMoment[] {
  const failures = new Map<number, FocusObservation>();
  for (const observation of observations) {
    if (!observation.failed || !focusCodes.has(observation.code) || !userPlies.has(observation.ply)) continue;
    const held = failures.get(observation.ply);
    if (!held || compareFailures(observation, held) < 0) failures.set(observation.ply, observation);
  }

  const byPly = new Map(existing.map((moment) => [moment.ply, moment]));
  const fresh: FocusObservation[] = [];
  for (const failure of failures.values()) {
    const held = byPly.get(failure.ply);
    if (!held || KIND_PRIORITY[held.kind] < KIND_PRIORITY.focus_failure) fresh.push(failure);
    else byPly.set(failure.ply, { ...held, focusCode: failure.code });
  }

  const added = fresh.sort((a, b) => compareFailures(a, b) || a.ply - b.ply).slice(0, maxNew);
  for (const failure of added) byPly.set(failure.ply, { ply: failure.ply, kind: 'focus_failure', cpLoss: 0, focusCode: failure.code });
  return [...byPly.values()].sort((a, b) => a.ply - b.ply);
}

/** Negative when `a` comes first: the more severe failure, then the more
 * reachable one (a failure a human could have avoided teaches more). */
function compareFailures(a: FocusObservation, b: FocusObservation): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.reachability - a.reachability;
}
