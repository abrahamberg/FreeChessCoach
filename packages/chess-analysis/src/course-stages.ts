import { COURSE_STAGES, type CourseArrow, type CourseNode, type CourseStage } from '@freechesscoach/shared';

// docs/courses.md §11: the stages of learning a course, in order (defined in
// shared, which the API validates with). Play through with all the arrows;
// practise the learner's own moves while the arrows fade; drill their side
// with none; then drill both sides.
export { COURSE_STAGES, type CourseStage };

export function nextCourseStage(stage: CourseStage): CourseStage | null {
  return COURSE_STAGES[COURSE_STAGES.indexOf(stage) + 1] ?? null;
}

/**
 * One move in practice. The arrows fade over rounds: a new move shows its
 * arrow; played right, it is `some_arrow` (every other move of the line still
 * shows it, so the arrows thin out rather than vanish at once); right again,
 * `no_arrow`; right without the arrow, `cleared` (known, no longer asked).
 * A miss turns the arrow back on.
 */
export type PracticeMoveState = 'arrow' | 'some_arrow' | 'no_arrow' | 'cleared';

/** `index` is the move's place among the moves asked in its line; in the
 * middle round the even ones (the first, third, …) keep their arrow. */
export function practiceShowsArrow(state: PracticeMoveState | undefined, index = 0): boolean {
  if (state === undefined || state === 'arrow') return true;
  return state === 'some_arrow' && index % 2 === 0;
}

export function practiceAsks(state: PracticeMoveState | undefined): boolean {
  return state !== 'cleared';
}

export function nextPracticeState(state: PracticeMoveState | undefined, correct: boolean): PracticeMoveState {
  if (!correct) return 'arrow';
  if (state === undefined || state === 'arrow') return 'some_arrow';
  return state === 'some_arrow' ? 'no_arrow' : 'cleared';
}

/** Practice is done once every move it asks has been cleared. */
export function isPracticeDone(keys: readonly string[], states: ReadonlyMap<string, PracticeMoveState>): boolean {
  return keys.length > 0 && keys.every((key) => states.get(key) === 'cleared');
}

/** The hint: an arrow for the move itself. */
export function practiceArrow(node: CourseNode): CourseArrow {
  return { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4), kind: 'best' };
}
