import type { CourseDocument, CourseKind, CourseNode } from '@freechesscoach/shared';
import { courseFenBefore } from './moves.js';
import { courseNodePath } from './node-path.js';
import { positionKey } from '../opening-book-key.js';

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

/** §11, per kind: how the learner's moves are asked. A master game is a
 * guess at each move, scored; tactics ask each example's move, whichever
 * side plays it. */
export type CourseDrillMode = 'learner_side' | 'find_move' | 'guess_move';

export const COURSE_DRILL_MODE: Record<CourseKind, CourseDrillMode> = {
  opening: 'learner_side',
  trap: 'learner_side',
  tactics: 'find_move',
  puzzle: 'learner_side',
  master_game: 'guess_move',
  endgame: 'learner_side',
  lesson: 'find_move',
  reading: 'guess_move'
};

/** Which side's moves are asked: the learner's own until the full drill,
 * where they play both (the opponent's moves are otherwise played for them). */
export type CourseDrillSides = 'learner' | 'both';

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
  sides: CourseDrillSides;
  episodes: CourseDrillEpisode[];
}

type DrillSpan = Pick<CourseDocument['episodes'][number], 'id' | 'role' | 'startNodeId' | 'endNodeId' | 'drillNodeIds'>;

/**
 * A line's episodes as one run, from the first one's first move to the last
 * one's last: a trap's setup, its one answer and its punishment are one
 * sequence to the learner, and played as three they were nine loops of
 * practice, three of them a single knight move (the owner, 2026-10-12).
 * Episodes join while they are in the same chapter and each goes further
 * down the same line; a sideline, or a line that goes back (a trap's safety
 * episode), starts a run of its own. The run keeps the first episode's id.
 */
function lineRuns(document: CourseDocument): DrillSpan[] {
  const chapterOf = (id: string): string | null => document.chapters.find((chapter) => chapter.episodeIds.includes(id))?.id ?? null;
  const runs: (DrillSpan & { chapter: string | null })[] = [];
  for (const episode of document.episodes.filter((each) => each.drillNodeIds.length > 0)) {
    const chapter = chapterOf(episode.id);
    const last = runs[runs.length - 1];
    const joined = last && chapter !== null && last.chapter === chapter ? courseNodePath(document.nodes, last.startNodeId, episode.endNodeId) : null;
    // Further down the same line: the episode starts after the run's end.
    if (last && joined?.includes(last.endNodeId) && joined.indexOf(episode.startNodeId) > joined.indexOf(last.endNodeId)) {
      last.endNodeId = episode.endNodeId;
      last.drillNodeIds = [...last.drillNodeIds, ...episode.drillNodeIds];
    } else runs.push({ id: episode.id, role: episode.role, startNodeId: episode.startNodeId, endNodeId: episode.endNodeId, drillNodeIds: [...episode.drillNodeIds], chapter });
  }
  return runs;
}

/**
 * The drill for a course: each line's episodes with drill moves as one run
 * (`lineRuns`; tactics and a master game keep one run an episode), walked from its
 * first move. With `sides: 'learner'` the episode's drill moves on the
 * learner's side are asked (for tactics, each example's move whichever side
 * plays it); with `'both'` every move is. The rest are played automatically. A
 * position + move asked earlier in the drill is not asked again. Episodes with
 * a missed or due move come first, so a branch the learner got wrong is met
 * more often. `states` holds the learner's progress by drill key.
 */
export function buildCourseDrill(
  document: CourseDocument,
  states: ReadonlyMap<string, CourseReviewState> = new Map(),
  today = '',
  sides: CourseDrillSides = 'learner'
): CourseDrill {
  const mode = COURSE_DRILL_MODE[document.kind];
  const learnerTurn = document.learnerSide === 'white' ? 'w' : 'b';
  const learnerAsks = (fenBefore: string): boolean => mode === 'find_move' || fenBefore.split(' ')[1] === learnerTurn;
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const fenBefore = (node: CourseNode): string => courseFenBefore(byId, document.startFen, node);
  const needsWork = (key: string): boolean => {
    const state = states.get(key);
    return state !== undefined && (state.step === 0 || isCourseReviewDue(state, today));
  };

  const drilled = (mode === 'learner_side' ? lineRuns(document) : document.episodes)
    .filter((episode) => episode.drillNodeIds.length > 0)
    .map((episode) => {
      const drillIds = new Set(episode.drillNodeIds);
      const path = courseNodePath(document.nodes, episode.startNodeId, episode.endNodeId) ?? [episode.endNodeId];
      const steps = path.flatMap((id) => {
        const node = byId.get(id);
        if (!node) return [];
        const before = fenBefore(node);
        return [{ node, fenBefore: before, key: courseDrillKey(before, node.uci), asked: sides === 'both' || (drillIds.has(id) && learnerAsks(before)) }];
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
  return { mode, sides, episodes };
}
