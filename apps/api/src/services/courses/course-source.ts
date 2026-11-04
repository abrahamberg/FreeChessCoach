import { endgameShapeProblems, parseCourseTreeOfKind, puzzleShapeProblems, quizSideProblems, type CourseTree } from '@freechesscoach/chess-analysis';
import type { CourseKind } from '@freechesscoach/shared';
import { ValidationError } from '../../lib/errors.js';

/** Bounds the one engine batch a course runs (a long master game with a few
 * sidelines fits; a whole repertoire does not). */
export const MAX_COURSE_NODES = 800;

/**
 * A course's PGN as the app reads it (docs/courses.md §4): the move tree of
 * its kind, refused with a `ValidationError` an editor can read when it does
 * not parse, has no moves or too many, or breaks its kind's shape. The
 * import checks every course against this; the studio calls it to start one.
 */
export function parseCourseSource(pgn: string, kind: Exclude<CourseKind, 'reading'>): CourseTree {
  const tree = parseCourseTreeOfKind(pgn, kind);
  if (tree.errors.length) throw new ValidationError(tree.errors.map((error) => error.message).join('; '));
  if (!tree.nodes.length) throw new ValidationError('The PGN has no moves');
  if (tree.nodes.length > MAX_COURSE_NODES) throw new ValidationError(`A course can have at most ${MAX_COURSE_NODES} moves`);
  const shape = kind === 'puzzle' ? puzzleShapeProblems(tree) : kind === 'endgame' ? endgameShapeProblems(tree) : [];
  if (shape.length) throw new ValidationError(shape.join('; '));
  return tree;
}

/** The learner's side must make the quiz moves the kind expects (§3). */
export function assertQuizSide(tree: CourseTree, learnerSide: 'white' | 'black'): void {
  const problems = quizSideProblems(tree, learnerSide);
  if (problems.length) throw new ValidationError(problems.join('; '));
}
