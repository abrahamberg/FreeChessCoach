import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { ChevronRightIcon } from '../../components/Icon.js';
import { CoachBoard, type BoardArrow, type BoardHighlight } from '../board/CoachBoard.js';
import { EvalBar } from '../board/EvalBar.js';
import { GameEvalChart } from '../board/GameEvalChart.js';
import { describePly, sanForPly } from '../chat/positionDivider.js';

export interface GameReviewBoardColumnProps {
  fen: string;
  orientation: 'white' | 'black';
  highlights: BoardHighlight[];
  /** Drawn only while anchored pre-move (see isAnchoredPreMove below) — the
   * move actually played (--played-move red) and, when it differs, the
   * engine's preferred move (--quality-best green). Both are legal from
   * `fen` itself, which is what makes anchoring pre-move necessary in the
   * first place — overlaid on the post-move position, either arrow could
   * start from a square that no longer holds the piece it names. */
  arrows: BoardArrow[];
  classifiedMoves: ClassifiedMoveDto[];
  sanMoves: string[];
  ply: number;
  onSelect: (ply: number) => void;
  /** True while `fen` is the position BEFORE `ply`'s move rather than after
   * it — useSessionBoardState's same show_position preMove device, here
   * driven by useGameReviewPageData instead of a coach tool call. Shows the
   * "white played e5 — reveal" pill; revealing swaps `fen` (and clears
   * `arrows`) to the actual post-move position, which is also how the
   * game's true final position (checkmate, etc.) stays reachable. */
  isAnchoredPreMove: boolean;
  onReveal: () => void;
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
  sanMoves,
  ply,
  onSelect,
  isAnchoredPreMove,
  onReveal,
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
      {isAnchoredPreMove && (
        <p className="played-move-pill">
          {describePly(ply).color} played {sanForPly(sanMoves, ply)}{' '}
          <button type="button" onClick={onReveal}>
            reveal
            <ChevronRightIcon width={13} height={13} />
          </button>
        </p>
      )}
      {isDesktop && classifiedMoves.length > 0 && <GameEvalChart classifiedMoves={classifiedMoves} currentPly={ply} onSelect={onSelect} />}
    </div>
  );
}
