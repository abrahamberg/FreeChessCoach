import { anchorPly, isMainNode } from '../board/move-tree-state.js';
import type { UseDivergedLineResult } from './useDivergedLine.js';

/** Shows a node of a session's move tree: a variation move through the
 * diverged line, a game move (null = the start) through the page's own
 * `onSelectPly`, which also leaves any variation. */
export function selectDivergedNode(divergedLine: UseDivergedLineResult, onSelectPly: (ply: number) => void, nodeId: string | null): void {
  if (nodeId === null) onSelectPly(0);
  else if (isMainNode(divergedLine.tree, nodeId)) onSelectPly(anchorPly(divergedLine.tree, nodeId));
  else divergedLine.select(nodeId);
}
