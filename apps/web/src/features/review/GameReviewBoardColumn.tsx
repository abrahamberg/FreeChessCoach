import type { ReactNode } from 'react';
import type { ClassifiedMoveDto, MoveQuality } from '@freechesscoach/shared';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';
import { CoachBoard, type BoardArrow, type BoardHighlight, type LocalMoveInfo } from '../board/CoachBoard.js';
import { EvalBar } from '../board/EvalBar.js';
import { GameEvalChart } from '../board/GameEvalChart.js';
import type { UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
// session-board-column/-row, peek-pill and undo-pill all live here; without
// this import they were only styled if a session page had loaded it first
// in the same tab (the unstyled "back to game" button was invisible in dark mode).
import '../session/SessionPage.css';

export interface GameReviewBoardColumnProps {
  fen: string;
  orientation: 'white' | 'black';
  highlights: BoardHighlight[];
  /** A single suggestion arrow (--quality-best green) for the engine's
   * preferred move, drawn only when useGameReviewPageData judges it won't
   * mislead on this position — see that hook's own doc comment. Empty
   * otherwise; the board never shows anything but the position the game
   * actually reached. Ignored while exploring — exploreFeedback.arrows take
   * over instead. */
  arrows: BoardArrow[];
  /** The current ply's move landed square + quality tier — see CoachBoard's
   * own `moveQualityBadge` doc comment. Undefined draws nothing. Ignored
   * while exploring, same as `arrows`. */
  moveQualityBadge?: { square: string; quality: MoveQuality };
  classifiedMoves: ClassifiedMoveDto[];
  ply: number;
  onSelect: (ply: number) => void;
  /** >=1080px only: eval-over-time chart under the board — a bonus visual,
   * not a navigation control (MoveExplorer, always rendered by
   * GameReviewPage itself at every width, already owns that plus the
   * plain-language notes a mobile Review page has no chat to convey
   * otherwise). */
  isDesktop: boolean;
  /** useGameReviewExplore: the board always takes a move. The learner's own
   * line is scored live and replaces the game's arrows and eval while it is
   * on the board. Leaving it is the note card's button, not a control here. */
  explore: {
    isExploring: boolean;
    /** The board shows a variation move: its engine feedback replaces the game's arrows. */
    inVariation: boolean;
    exploreFeedback: UseExploreFeedbackResult;
    onLocalMove: (fen: string, move: LocalMoveInfo) => void;
  };
}

/** The board + its eval indicators for the Game Review page. Stepping through
 * the game is done via MoveExplorer's own nav pills/move list; dragging a
 * piece starts the learner's own line, a local sandbox (mode="peek", the same one the live Coach
 * session's SessionBoardColumn uses): legal-move dots return (respecting
 * Settings > Board), `disabled` drops, and every dropped move is scored by
 * the real engine pipeline (useGameReviewExplore/useExploreFeedback) and can
 * land in the move list as variations, all without
 * ever mutating the stored game — closing the sandbox (the "back to game"
 * pill, or navigating the real move list) always restores the actual
 * position exactly as it was. */
export function GameReviewBoardColumn({
  fen,
  orientation,
  highlights,
  arrows,
  moveQualityBadge,
  classifiedMoves,
  ply,
  onSelect,
  isDesktop,
  explore
}: GameReviewBoardColumnProps): ReactNode {
  const [showLegalMoveDots] = useShowLegalMoveDots();
  const { isExploring, inVariation, exploreFeedback } = explore;
  const showFeedback = isExploring || inVariation;

  const exploreMoveQualityBadge =
    showFeedback && exploreFeedback.note?.uci ? { square: exploreFeedback.note.uci.slice(2, 4), quality: exploreFeedback.note.quality } : undefined;

  return (
    <div className="session-board-column">
      <div className="session-board-row">
        <EvalBar ply={ply} classifiedMoves={classifiedMoves} orientation={orientation} cpOverride={showFeedback ? (exploreFeedback.evalCp ?? undefined) : undefined} />
        <CoachBoard
          fen={fen}
          orientation={orientation}
          mode="peek"
          isExploring={inVariation}
          arrows={showFeedback ? [...arrows, ...exploreFeedback.arrows] : arrows}
          highlights={showFeedback ? [...highlights, ...exploreFeedback.highlights] : highlights}
          onLocalMove={explore.onLocalMove}
          moveQualityBadge={showFeedback ? exploreMoveQualityBadge : moveQualityBadge}
          showLegalMoveDots={showLegalMoveDots}
        />
      </div>
      {isDesktop && classifiedMoves.length > 0 && <GameEvalChart classifiedMoves={classifiedMoves} currentPly={ply} onSelect={onSelect} />}
    </div>
  );
}
