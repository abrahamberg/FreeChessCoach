import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { MoveExplorer } from './MoveExplorer.js';
import { useLineExplorer } from './line-tree.js';

export interface LineMoveExplorerProps {
  sanMoves: string[];
  classifiedMoves: ClassifiedMoveDto[];
  /** ply-indexed positions (ply 0 = where the line starts). */
  positions: { ply: number; fen: string }[];
  currentPly: number;
  onSelect: (ply: number) => void;
  showNotes?: boolean;
  dimmedThroughPly?: number;
  hideNav?: boolean;
}

/** `MoveExplorer` for a page that has one line and the ply it shows: the line
 * becomes a tree and node ids map back to plies in `line-tree.ts`. */
export function LineMoveExplorer({ sanMoves, classifiedMoves, positions, currentPly, onSelect, ...rest }: LineMoveExplorerProps): ReactNode {
  const explorer = useLineExplorer(sanMoves, positions.find((position) => position.ply === 0)?.fen, classifiedMoves, currentPly, onSelect);
  return <MoveExplorer {...explorer} {...rest} />;
}
