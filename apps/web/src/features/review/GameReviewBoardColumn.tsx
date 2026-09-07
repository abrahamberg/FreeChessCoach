import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { CoachBoard, type BoardArrow, type BoardHighlight } from '../board/CoachBoard.js';
import { EvalBar } from '../board/EvalBar.js';
import { GameEvalChart } from '../board/GameEvalChart.js';

export interface GameReviewBoardColumnProps {
  fen: string;
  orientation: 'white' | 'black';
  highlights: BoardHighlight[];
  /** A single suggestion arrow (--quality-best green) for the engine's
   * preferred move, drawn only when useGameReviewPageData judges it won't
   * mislead on this position — see that hook's own doc comment. Empty
   * otherwise; the board never shows anything but the position the game
   * actually reached. */
  arrows: BoardArrow[];
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
 * chat, no play-move submission, no annotations. `mode="peek"` alone only
 * stops a completed drag from being sent anywhere (CoachBoard's onUserMove);
 * it still lets a move be made and previewed locally, and still shows
 * legal-move dots on selection. `disabled` (which CoachBoard's own
 * `applyMove` checks before touching the position at all) plus
 * `showLegalMoveDots={false}` are both needed to make the board genuinely
 * inert — stepping through the game is done via MoveExplorer's own nav
 * pills/move list, never by dragging pieces here. */
export function GameReviewBoardColumn({
  fen,
  orientation,
  highlights,
  arrows,
  classifiedMoves,
  ply,
  onSelect,
  isDesktop
}: GameReviewBoardColumnProps): ReactNode {
  const evalBar = <EvalBar ply={ply} classifiedMoves={classifiedMoves} orientation={orientation} layout={isDesktop ? 'vertical' : 'horizontal'} />;

  return (
    <div className="session-board-column">
      {!isDesktop && evalBar}
      <div className="session-board-row">
        {isDesktop && evalBar}
        <CoachBoard fen={fen} orientation={orientation} mode="peek" arrows={arrows} highlights={highlights} showLegalMoveDots={false} disabled />
      </div>
      {isDesktop && classifiedMoves.length > 0 && <GameEvalChart classifiedMoves={classifiedMoves} currentPly={ply} onSelect={onSelect} />}
    </div>
  );
}
