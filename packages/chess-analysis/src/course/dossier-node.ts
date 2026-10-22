import type { CourseGlyph, CourseMark, EngineEval } from '@freechesscoach/shared';
import type { ClassifiedMove } from '../classify.js';
import { buildMoveStory, type MoveStory } from '../move-story.js';
import type { CourseTemptingFacts } from './tempting.js';
import type { CourseTreeNode } from './tree.js';

/** A course move: the move's story (`move-story.ts`, the same facts Game
 * Review says) and what the course adds about it. */
export interface CourseNodeFacts extends MoveStory {
  nodeId: string;
  lineId: string;
  /** §13.5: checks, captures and threats that look right here and fail,
   * with the engine's answer (`withTempting`, after a second engine batch);
   * empty until then. */
  tempting: CourseTemptingFacts[];
  quizEligible: boolean;
  critical: boolean;
  creatorComment: string | null;
  /** The creator's `@key`, `@quiz`, `@slow`, `@fast`, `@reel` and `!`/`??` on the move: their steer, as data. */
  creatorMarks: CourseMark[];
  creatorGlyph: CourseGlyph | null;
}

export interface CourseNodeFactsInput {
  node: CourseTreeNode;
  move: ClassifiedMove;
  fenBefore: string;
  /** The line's positions from the start up to and including this node's. */
  linePositionFens: string[];
  evalsByFen: ReadonlyMap<string, EngineEval>;
  critical: boolean;
  learnerSide: 'white' | 'black';
  /** The creator marked the example "no evaluation" (`@noeval` on this move
   * or one before it): the position is a teaching setup, not a game. */
  noEvaluation: boolean;
}

export function buildCourseNodeFacts(input: CourseNodeFactsInput): CourseNodeFacts {
  const { node, move } = input;
  const story = buildMoveStory({
    move,
    fenBefore: input.fenBefore,
    fenAfter: node.fenAfter,
    linePositionFens: input.linePositionFens,
    evalsByFen: input.evalsByFen,
    isReaderMove: move.mover === input.learnerSide,
    noEvaluation: input.noEvaluation
  });
  return {
    ...story,
    nodeId: node.id,
    lineId: node.lineId,
    tempting: [],
    quizEligible: story.onlyMove,
    critical: input.critical,
    creatorComment: node.comment,
    creatorMarks: node.marks,
    creatorGlyph: node.glyph
  };
}
