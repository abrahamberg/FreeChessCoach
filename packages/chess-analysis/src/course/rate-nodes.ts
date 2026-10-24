import type { CourseNodeEvals, EngineEval } from '@freechesscoach/shared';
import { classifyLiveMove } from '../classify.js';
import { noEvaluationNodeIds } from './dossier.js';
import type { CourseTree } from './tree.js';

/** A course tree's moves rated the way the live review rates one: each
 * move's White-perspective evaluation after it and its quality, from the
 * engine's lines at the positions before and after. No dossier. Moves the
 * creator marked "no evaluation" are left out. `evalsByFen` needs lines at
 * every position a move is played from (two make "great" and "brilliant"
 * possible). */
export function rateCourseNodes(tree: CourseTree, learnerSide: 'white' | 'black', evalsByFen: ReadonlyMap<string, EngineEval>): CourseNodeEvals {
  const unevaluated = noEvaluationNodeIds(tree);
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const depth = new Map<string, number>();
  const rated: CourseNodeEvals = {};
  for (const node of tree.nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    depth.set(node.id, (parent ? (depth.get(parent.id) ?? 0) : 0) + 1);
    if (unevaluated.has(node.id)) continue;
    const fenBefore = parent ? parent.fenAfter : (node.startFen ?? tree.startFen);
    const move = classifyLiveMove({
      ply: depth.get(node.id) ?? 1,
      moveSan: node.san,
      mover: fenBefore.split(' ')[1] === 'b' ? 'black' : 'white',
      fenBefore,
      evalBefore: evalsByFen.get(fenBefore),
      evalAfter: evalsByFen.get(node.fenAfter),
      userColor: learnerSide
    });
    rated[node.id] = { san: node.san, cp: move.evalAfterCp, quality: move.quality };
  }
  return rated;
}
