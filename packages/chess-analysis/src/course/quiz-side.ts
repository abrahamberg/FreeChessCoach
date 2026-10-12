import { moveLabel } from './moves.js';
import type { CourseTree } from './tree.js';

/** M5: a `@quiz` asks the learner to find the move, so it must be a move of
 * the learner's side. One sentence per mark that is not. */
export function quizSideProblems(tree: Pick<CourseTree, 'startFen' | 'nodes'>, learnerSide: 'white' | 'black'): string[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  return tree.nodes.flatMap((node) => {
    if (!node.marks.includes('quiz')) return [];
    const fenBefore = (node.parentId ? byId.get(node.parentId)?.fenAfter : undefined) ?? tree.startFen;
    const mover = fenBefore.split(' ')[1] === 'b' ? 'black' : 'white';
    if (mover === learnerSide) return [];
    const [name, other] = mover === 'white' ? ['White', 'Black'] : ['Black', 'White'];
    return [`@quiz is on ${moveLabel(fenBefore, node.san, '...')}, a move by ${name}, but the learner plays ${other}: mark a move of the learner's side`];
  });
}
