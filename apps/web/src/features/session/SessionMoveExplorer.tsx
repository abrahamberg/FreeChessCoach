import { useMemo, type ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { mainNodeAtPly, qualitiesByMainNode } from '../board/move-tree-state.js';
import { selectDivergedNode } from './selectDivergedNode.js';
import type { UseDivergedLineResult } from './useDivergedLine.js';

export interface SessionMoveExplorerProps {
  divergedLine: UseDivergedLineResult;
  classifiedMoves: ClassifiedMoveDto[];
  /** The game's ply on the board when no variation is shown. */
  currentPly: number;
  /** Shows the game at a ply (and leaves any variation). */
  onSelectPly: (ply: number) => void;
  showNotes?: boolean;
  /** The engine's verdict on each move of the student's own lines, by node id: they get the icons and notes the game's moves have. */
  liveQualities?: Record<string, ClassifiedMoveDto>;
  /** Given while the student's line is on the board: the Notes box carries "Back to game". */
  onBackToGame?: () => void;
}

/** `MoveExplorer` for a session: the game's moves with every line the student
 * and the coach explored as a variation. The game's own position is the page's
 * (`currentPly`); a variation move is the diverged line's. */
export function SessionMoveExplorer({ divergedLine, classifiedMoves, currentPly, onSelectPly, showNotes, liveQualities, onBackToGame }: SessionMoveExplorerProps): ReactNode {
  const { tree, currentId } = divergedLine;
  const qualities = useMemo(() => ({ ...qualitiesByMainNode(tree, classifiedMoves), ...liveQualities }), [tree, classifiedMoves, liveQualities]);
  return (
    <MoveExplorer
      tree={tree}
      currentNodeId={currentId ?? mainNodeAtPly(tree, currentPly)}
      onSelect={(nodeId) => selectDivergedNode(divergedLine, onSelectPly, nodeId)}
      qualities={qualities}
      showNotes={showNotes}
      onRemoveBranch={divergedLine.removeBranch}
      onBackToGame={onBackToGame}
    />
  );
}
