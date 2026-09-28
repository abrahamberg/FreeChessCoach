import type { CourseArrow, CourseNode } from '@freechesscoach/shared';

/** docs/courses.md §11: the stages of learning a course, in order. Play
 * through with all the arrows; practise the learner's own moves while the
 * arrows fade; drill their side with none; then drill both sides. */
export const COURSE_STAGES = ['play_through', 'practice', 'drill', 'full_drill'] as const;
export type CourseStage = (typeof COURSE_STAGES)[number];

export function nextCourseStage(stage: CourseStage): CourseStage | null {
  return COURSE_STAGES[COURSE_STAGES.indexOf(stage) + 1] ?? null;
}

/**
 * One move in practice. It shows its arrow until the learner has played it
 * right, then is asked without the arrow; right again and it is cleared (no
 * longer asked in practice). A miss turns the arrow back on.
 */
export type PracticeMoveState = 'arrow' | 'no_arrow' | 'cleared';

export function practiceShowsArrow(state: PracticeMoveState | undefined): boolean {
  return state === undefined || state === 'arrow';
}

export function practiceAsks(state: PracticeMoveState | undefined): boolean {
  return state !== 'cleared';
}

export function nextPracticeState(state: PracticeMoveState | undefined, correct: boolean): PracticeMoveState {
  if (!correct) return 'arrow';
  return practiceShowsArrow(state) ? 'no_arrow' : 'cleared';
}

/** Practice is done once every move it asks has been cleared. */
export function isPracticeDone(keys: readonly string[], states: ReadonlyMap<string, PracticeMoveState>): boolean {
  return keys.length > 0 && keys.every((key) => states.get(key) === 'cleared');
}

/** The hint: an arrow for the move itself. */
export function practiceArrow(node: CourseNode): CourseArrow {
  return { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4), kind: 'best' };
}
