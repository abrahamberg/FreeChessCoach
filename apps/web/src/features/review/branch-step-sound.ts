import { pathTo, type EditableTree, type PgnTreeNode } from '@freechesscoach/chess-analysis';
import { anchorPly, isMainNode } from '../board/move-tree-state.js';

/** The move to sound when the review moves from one tree node to another,
 * beyond what the game's own ply steps already sound (useMoveStepSounds):
 * any move on a variation, and the main-line move picked after leaving one.
 * Stepping back sounds nothing, and neither does a main-line step that the
 * ply hook already covers (the move one past where the variation branched). */
export function branchStepNode(tree: EditableTree, from: string | null, to: string | null): PgnTreeNode | null {
  if (to === null || to === from) return null;
  const node = tree.nodes.find((each) => each.id === to);
  if (!node) return null;
  if (from !== null && tree.nodes.find((each) => each.id === from)?.parentId === to) return null;
  if (!isMainNode(tree, to)) return node;
  if (from === null || isMainNode(tree, from)) return null;
  return anchorPly(tree, from) + 1 === pathTo(tree, to).length ? null : node;
}
