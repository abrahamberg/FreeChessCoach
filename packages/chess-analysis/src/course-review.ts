import type { CourseDocument, CourseKind, CourseNode } from '@freechesscoach/shared';
import { courseNodePath } from './course-node-path.js';
import { positionKey } from './opening-book-key.js';

/** docs/courses.md §11: the review steps after a correct drill, in days.
 * One more correct answer after the last step and the move is mastered. */
export const COURSE_REVIEW_INTERVAL_DAYS = [7, 21, 63] as const;
/** The step a move reaches once mastered; it is never due again. */
export const COURSE_REVIEW_MASTERED = COURSE_REVIEW_INTERVAL_DAYS.length + 1;

/** Where one position + move stands. Days are calendar dates (YYYY-MM-DD) in
 * the learner's own time zone, so "due today" means their today. */
export interface CourseReviewState {
  step: number;
  /** null once mastered. */
  dueOn: string | null;
}

/** A correct drill moves on a step (due 1, 3, 9 weeks later, then mastered);
 * a miss goes back to the start, due tomorrow. A move never drilled is step 0. */
export function nextCourseReview(state: CourseReviewState | null, correct: boolean, today: string): CourseReviewState {
  if (!correct) return { step: 0, dueOn: addDays(today, 1) };
  const step = Math.min((state?.step ?? 0) + 1, COURSE_REVIEW_MASTERED);
  const days = COURSE_REVIEW_INTERVAL_DAYS[step - 1];
  return { step, dueOn: days === undefined ? null : addDays(today, days) };
}

export function isCourseReviewDue(state: CourseReviewState, today: string): boolean {
  return state.dueOn !== null && state.dueOn <= today;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Progress is kept per position + move, never per node or episode, so a
 * republished course (or another course reaching the same position) keeps
 * the learner's history (§10). */
export function courseDrillKey(fenBefore: string, uci: string): string {
  return `${positionKey(fenBefore)}|${uci}`;
}

/** §11, per kind: which moves the learner plays in a drill. */
export type CourseDrillMode = 'learner_side' | 'both_sides' | 'find_move' | 'guess_move';

export const COURSE_DRILL_MODE: Record<CourseKind, CourseDrillMode> = {
  opening_reel: 'learner_side',
  opening_course: 'learner_side',
  trap: 'both_sides',
  tactics: 'find_move',
  master_game: 'guess_move'
};

export interface CourseDrillStep {
  node: CourseNode;
  fenBefore: string;
  key: string;
  /** The learner plays this move; otherwise it is played for them. */
  asked: boolean;
}

export interface CourseDrillEpisode {
  episodeId: string;
  role: string;
  steps: CourseDrillStep[];
}

export interface CourseDrill {
  mode: CourseDrillMode;
  episodes: CourseDrillEpisode[];
}

/**
 * The drill for a course: each episode with drill moves, walked from its
 * first move. The episode's drill moves are asked (both sides' moves for a
 * trap, springing it and avoiding it); the rest are played automatically. A
 * position + move asked earlier in the drill is not asked again. Episodes with
 * a missed or due move come first, so a branch the learner got wrong is met
 * more often. `states` holds the learner's progress by drill key.
 */
export function buildCourseDrill(document: CourseDocument, states: ReadonlyMap<string, CourseReviewState> = new Map(), today = ''): CourseDrill {
  const mode = COURSE_DRILL_MODE[document.kind];
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const fenBefore = (node: CourseNode): string => (node.parentId ? byId.get(node.parentId)?.fenAfter : undefined) ?? document.startFen;
  const needsWork = (key: string): boolean => {
    const state = states.get(key);
    return state !== undefined && (state.step === 0 || isCourseReviewDue(state, today));
  };

  const drilled = document.episodes
    .filter((episode) => episode.drillNodeIds.length > 0)
    .map((episode) => {
      const drillIds = new Set(episode.drillNodeIds);
      const path = courseNodePath(document.nodes, episode.startNodeId, episode.endNodeId) ?? [episode.endNodeId];
      const steps = path.flatMap((id) => {
        const node = byId.get(id);
        if (!node) return [];
        const before = fenBefore(node);
        return [{ node, fenBefore: before, key: courseDrillKey(before, node.uci), asked: mode === 'both_sides' || drillIds.has(id) }];
      });
      return { episodeId: episode.id, role: episode.role, steps };
    });

  const ordered = [...drilled.filter((episode) => episode.steps.some((step) => step.asked && needsWork(step.key))), ...drilled.filter((episode) => !episode.steps.some((step) => step.asked && needsWork(step.key)))];
  const seen = new Set<string>();
  const episodes = ordered
    .map((episode) => ({
      ...episode,
      steps: episode.steps.map((step) => {
        const asked = step.asked && !seen.has(step.key);
        if (asked) seen.add(step.key);
        return { ...step, asked };
      })
    }))
    .filter((episode) => episode.steps.some((step) => step.asked));
  return { mode, episodes };
}
