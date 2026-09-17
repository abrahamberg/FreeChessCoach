import type { ReactNode } from 'react';
import type { ClassifiedMoveDto, MoveQuality } from '@freechesscoach/shared';
import { ChevronLeftIcon, UndoIcon } from '../../components/Icon.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';
import { CoachBoard, type BoardArrow, type BoardHighlight, type LocalMoveInfo } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { EvalBar } from '../board/EvalBar.js';
import { ExploreNoteCard } from '../board/ExploreNoteCard.js';
import { ExplorePanel } from '../board/ExplorePanel.js';
import { GameEvalChart } from '../board/GameEvalChart.js';
import type { UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import type { UseDivergedLineResult } from '../session/useDivergedLine.js';

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
  /** useGameReviewExplore — "explore on your own" (design.md §5.6's Explore
   * panel, ported from the live Coach session). When open, the board stops
   * being inert: dragging a piece plays a real, engine-scored local move
   * that never touches the stored game. */
  explore: {
    isExploring: boolean;
    open: () => void;
    close: () => void;
    divergedLine: UseDivergedLineResult;
    exploreFeedback: UseExploreFeedbackResult;
    onLocalMove: (fen: string, move: LocalMoveInfo) => void;
    autoplayIntervalMs: number;
    onChangeAutoplayInterval: (ms: number) => void;
  };
}

/** The board + its eval indicators for the Game Review page. Read-only by
 * default — stepping through the game is done via MoveExplorer's own nav
 * pills/move list, never by dragging pieces here — but `explore.isExploring`
 * flips it into a local sandbox (mode="peek", the same one the live Coach
 * session's SessionBoardColumn uses): legal-move dots return (respecting
 * Settings > Board), `disabled` drops, and every dropped move is scored by
 * the real engine pipeline (useGameReviewExplore/useExploreFeedback) and can
 * build out into a whole alternative line (DivergedLinePanel), all without
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
  const { isExploring, divergedLine, exploreFeedback } = explore;

  const exploreMoveQualityBadge =
    isExploring && exploreFeedback.note?.uci ? { square: exploreFeedback.note.uci.slice(2, 4), quality: exploreFeedback.note.quality } : undefined;

  return (
    <div className="session-board-column">
      <div className="session-board-row">
        <EvalBar ply={ply} classifiedMoves={classifiedMoves} orientation={orientation} cpOverride={isExploring ? (exploreFeedback.evalCp ?? undefined) : undefined} />
        <CoachBoard
          fen={fen}
          orientation={orientation}
          mode="peek"
          arrows={isExploring ? [...arrows, ...exploreFeedback.arrows] : arrows}
          highlights={highlights}
          onLocalMove={explore.onLocalMove}
          moveQualityBadge={isExploring ? exploreMoveQualityBadge : moveQualityBadge}
          showLegalMoveDots={isExploring && showLegalMoveDots}
          disabled={!isExploring}
        />
      </div>
      {divergedLine.line && (
        <p className="undo-pill">
          <button type="button" onClick={divergedLine.undoLastMove}>
            <UndoIcon width={13} height={13} />
            undo last move
          </button>
        </p>
      )}
      {isExploring && (
        <p className="peek-pill">
          exploring —{' '}
          <button type="button" onClick={explore.close}>
            <ChevronLeftIcon width={13} height={13} />
            back to game
          </button>
        </p>
      )}
      {/* Desktop always shows the toggle/pill here (its diverged-line view
          lives in the page's sidebar explorer column instead, replacing
          MoveExplorer — GameReviewPage.tsx); mobile has no sidebar, so this
          slot swaps to DivergedLinePanel itself once a line exists, same
          split SessionBoardColumn already makes. */}
      {!isDesktop && divergedLine.line ? (
        <DivergedLinePanel
          line={divergedLine.line}
          stepIndex={divergedLine.stepIndex}
          onSelectStep={divergedLine.previewStep}
          onExit={explore.close}
          autoplayIntervalMs={explore.autoplayIntervalMs}
          onChangeAutoplayInterval={explore.onChangeAutoplayInterval}
        />
      ) : (
        <ExplorePanel isOpen={isExploring} onOpen={explore.open} onClose={explore.close} status={exploreFeedback.status} evaluation={exploreFeedback.evaluation} />
      )}
      {isDesktop && isExploring && <ExploreNoteCard status={exploreFeedback.status} evaluation={exploreFeedback.evaluation} note={exploreFeedback.note} />}
      {isDesktop && classifiedMoves.length > 0 && <GameEvalChart classifiedMoves={classifiedMoves} currentPly={ply} onSelect={onSelect} />}
    </div>
  );
}
