import { useMemo } from 'react';
import type { EditableTree } from '@freechesscoach/chess-analysis';
import { DEFAULT_POSITION } from 'chess.js';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { lineGameTree } from './move-tree-state.js';

/** The explorer's view of one line: `lineGameTree` gives its nodes the ids `n1`,
 * `n2` … in move order, so a ply and a node id map to each other by number. */
export function nodeIdOfPly(ply: number): string | null {
  return ply <= 0 ? null : `n${ply}`;
}

export function plyOfNodeId(nodeId: string | null): number {
  return nodeId === null ? 0 : Number(nodeId.slice(1));
}

/** The classified moves keyed by the node id of their ply. */
export function qualitiesByNodeId(classifiedMoves: ClassifiedMoveDto[]): Record<string, ClassifiedMoveDto> {
  return Object.fromEntries(classifiedMoves.map((move) => [`n${move.ply}`, move]));
}

export interface LineExplorerProps {
  tree: EditableTree;
  currentNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  qualities: Record<string, ClassifiedMoveDto>;
}

/** What `MoveExplorer` takes for a page that has only a line of moves and the
 * ply it shows: the tree, the current node, the qualities by node id. */
export function useLineExplorer(
  sanMoves: string[],
  startFen: string | undefined,
  classifiedMoves: ClassifiedMoveDto[],
  currentPly: number,
  onSelectPly: (ply: number) => void
): LineExplorerProps {
  const tree = useGameLineTree(startFen, sanMoves);
  const qualities = useMemo(() => qualitiesByNodeId(classifiedMoves), [classifiedMoves]);
  return { tree, currentNodeId: nodeIdOfPly(currentPly), onSelect: (nodeId) => onSelectPly(plyOfNodeId(nodeId)), qualities };
}

/** The game as a move tree (nodes `n1`, `n2` … in move order), the same tree
 * until the moves or the start change, so the variations made on it are kept. */
export function useGameLineTree(startFen: string | undefined, sanMoves: string[]): EditableTree {
  const movesKey = sanMoves.join(' ');
  return useMemo(() => lineGameTree(startFen ?? DEFAULT_POSITION, sanMoves), [movesKey, startFen]);
}
