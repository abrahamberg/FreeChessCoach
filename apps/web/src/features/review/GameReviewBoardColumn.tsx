import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { CoachBoard, type BoardHighlight } from '../board/CoachBoard.js';
import { EvalBar } from '../board/EvalBar.js';
import { GameEvalChart } from '../board/GameEvalChart.js';

export interface GameReviewBoardColumnProps {
  fen: string;
  orientation: 'white' | 'black';
  highlights: BoardHighlight[];
  classifiedMoves: ClassifiedMoveDto[];
  ply: number;
  onSelect: (ply: number) => void;
  /** >=1080px: eval-over-time chart under the board — a bonus visual, not a
   * navigation control (MoveExplorer, always rendered by GameReviewPage
   * itself at every width, already owns that plus the plain-language notes
   * a mobile Review page has no chat to convey otherwise). */
  isDesktop: boolean;
}

/** The board + its eval indicators for the read-only Game Review page — no
 * chat, no play-move submission, no annotations. The board is always in
 * 'peek' mode (pure navigation, nothing to send anywhere) and never wired
 * with onUserMove/onLocalMove, so a drag attempt simply snaps back; stepping
 * through the game is done via MoveExplorer's own nav pills/move list. */
export function GameReviewBoardColumn({ fen, orientation, highlights, classifiedMoves, ply, onSelect, isDesktop }: GameReviewBoardColumnProps): ReactNode {
  const evalBar = <EvalBar ply={ply} classifiedMoves={classifiedMoves} orientation={orientation} layout={isDesktop ? 'vertical' : 'horizontal'} />;

  return (
    <div className="session-board-column">
      {!isDesktop && evalBar}
      <div className="session-board-row">
        {isDesktop && evalBar}
        <CoachBoard fen={fen} orientation={orientation} mode="peek" highlights={highlights} />
      </div>
      {isDesktop && classifiedMoves.length > 0 && <GameEvalChart classifiedMoves={classifiedMoves} currentPly={ply} onSelect={onSelect} />}
    </div>
  );
}
