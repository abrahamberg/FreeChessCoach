import { isTopReviewTier } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { OverflowMenuItem } from '../../components/OverflowMenu.js';
import { ENGINE_MODE_BADGE, useEngineActivityIndicator } from '../../hooks/useEngineActivityIndicator.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { ExploreNoteCard } from '../board/ExploreNoteCard.js';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { MoveNavStrip } from '../board/MoveNavStrip.js';
import { SessionHeader } from '../session/SessionHeader.js';
import { GameReviewBoardColumn } from './GameReviewBoardColumn.js';
import { MoveNoteCard } from './MoveNoteCard.js';
import { useGameReviewExplore } from './useGameReviewExplore.js';
import { useGameReviewPageData } from './useGameReviewPageData.js';
import '../../styles/board-bottom-bar.css';
import './GameReviewPage.css';

/** The static, move-by-move Game Report review — chess.com-style "Review",
 * distinct from the Coach tab's live LLM conversation (architecture: Games
 * page tabs/promotion). No chat, no coach turn, nothing that spends a
 * credit: every note here is the same pre-baked, deterministic text
 * (move-reasons.ts/describe-tactic-hit.ts) already stored on the analysis.
 * "Continue with Coach" is the one bridge to the paid conversation — a
 * small icon in MoveNoteCard's own header — and the only mutation this page
 * makes. "Explore on your own" (useGameReviewExplore) is a separate,
 * unlimited escape hatch from the read-only move list: a local sandbox that
 * scores whatever the student actually drags on the board via the same free
 * engine endpoint the live Coach session's Explore panel uses — never a
 * chat turn, never touches the stored game.
 *
 * Below the desktop breakpoint: note card, then the board, then MoveNavStrip
 * (step chevrons + the scrollable move-chip list, combined into one row —
 * they used to be two stacked rows) below it — chess.com's own mobile
 * ordering (note above, moves below), and that combined row sits under the
 * board rather than above it: the board is the scarcest-space element on a
 * phone (same call SessionPage.css makes for the live session), so
 * everything that doesn't need to precede it stays out of its way,
 * edge-to-edge and sized from its own width rather than from whatever its
 * neighbors leave behind (see GameReviewPage.css's own mobile section for
 * the reasoning). Game Report
 * is a bottom sheet (GameReportSummary's own existing expand/collapse
 * state, just given fixed/overlay positioning here) rather than another
 * flex child, so opening it covers the board instead of pushing it around.
 *
 * At the desktop breakpoint, the note card takes the same MoveNoteCard the
 * mobile layout uses, placed in the column a coaching session's chat pane
 * would occupy — explorer/game-report keep their normal session-page
 * position on the left rather than swapping sides, and pass
 * showNotes={false} since the note column already shows the same text. */
export function GameReviewPage(): ReactNode {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  // AppShell hides its own top bar (Settings, the engine indicator) for
  // every board route — SessionHeader's own overflow menu is the only place
  // left to reach them from here.
  const engineActivity = useEngineActivityIndicator();
  const {
    gameQuery,
    positions,
    sanMoves,
    classifiedMoves,
    currentMove,
    ply,
    setPly,
    fen,
    currentRealPosition,
    highlights,
    arrows,
    moveQualityBadge,
    coachPersona,
    tacticSelection,
    onToggleTacticSelection,
    continueWithCoach,
    isContinuingWithCoach,
    continueWithCoachError
  } = useGameReviewPageData(gameId ?? '');

  const explore = useGameReviewExplore(currentRealPosition);
  // While exploring, the board shows the sandbox's own position (the real
  // game's line prefixed with whatever the student has played locally) —
  // useGameReviewExplore closes the sandbox itself the moment `ply` moves
  // out from under it (MoveExplorer/MoveNavStrip), so `fen` alone is always
  // correct once that happens.
  const displayFen = explore.divergedLine.fen ?? fen;

  if (gameQuery.isLoading) return <p>Loading…</p>;
  if (gameQuery.isError || !gameQuery.data) return <p>Could not load this game.</p>;

  const game = gameQuery.data;
  const orientation = game.userColor;
  const canContinueWithCoach = !isTopReviewTier(game.reviewTier) && game.analysisStatus === 'ready';
  const engineBadge = engineActivity.engineMode ? ENGINE_MODE_BADGE[engineActivity.engineMode] : 'Engine';
  const headerExtraItems: OverflowMenuItem[] = [
    { label: `Engine: ${engineBadge}`, onSelect: () => navigate('/settings#settings-engine') },
    { label: 'Settings', onSelect: () => navigate('/settings') }
  ];

  const board = (
    <GameReviewBoardColumn
      fen={displayFen}
      orientation={orientation}
      highlights={highlights}
      arrows={arrows}
      moveQualityBadge={moveQualityBadge}
      classifiedMoves={classifiedMoves}
      ply={ply}
      onSelect={setPly}
      isDesktop={isDesktop}
      explore={{
        isExploring: explore.isExploring,
        open: explore.open,
        close: explore.close,
        divergedLine: explore.divergedLine,
        exploreFeedback: explore.exploreFeedback,
        onLocalMove: explore.handleLocalMove,
        autoplayIntervalMs: explore.autoplayIntervalMs,
        onChangeAutoplayInterval: explore.setAutoplayIntervalMs
      }}
    />
  );

  const noteCard = explore.isExploring ? (
    <ExploreNoteCard status={explore.exploreFeedback.status} evaluation={explore.exploreFeedback.evaluation} note={explore.exploreFeedback.note} />
  ) : (
    <MoveNoteCard
      ply={ply}
      san={sanMoves[ply - 1] ?? null}
      move={currentMove}
      coachPersona={coachPersona}
      onContinueWithCoach={canContinueWithCoach ? continueWithCoach : undefined}
      isContinuingWithCoach={isContinuingWithCoach}
      tacticSelection={tacticSelection}
      onToggleTacticSelection={onToggleTacticSelection}
    />
  );

  return (
    <div className="game-review-page">
      <SessionHeader
        whiteName={game.whiteName}
        blackName={game.blackName}
        result={game.result}
        onBack={() => navigate('/games')}
        extraItems={headerExtraItems}
      />
      {continueWithCoachError && (
        <p className="game-review-page__error" role="alert">
          Could not start a coaching session — try again.
        </p>
      )}
      {isDesktop ? (
        <div className="game-review-body desktop">
          {/* Same three-column arrangement the coaching session uses
              (SessionPage.css's session-move-explorer-column/chat-pane) —
              explorer + game report stay on the left where they normally
              sit; the note card takes the right column a chat pane would
              occupy in a coaching session, rather than displacing either. */}
          <div className="game-review-explorer-column">
            {explore.divergedLine.line ? (
              <DivergedLinePanel
                line={explore.divergedLine.line}
                stepIndex={explore.divergedLine.stepIndex}
                onSelectStep={explore.divergedLine.previewStep}
                onExit={explore.close}
                autoplayIntervalMs={explore.autoplayIntervalMs}
                onChangeAutoplayInterval={explore.setAutoplayIntervalMs}
              />
            ) : (
              <>
                <MoveExplorer
                  sanMoves={sanMoves}
                  classifiedMoves={classifiedMoves}
                  positions={positions}
                  currentPly={ply}
                  onSelect={setPly}
                  showNotes={false}
                />
                {game.gameReport && <GameReportSummary report={game.gameReport} userColor={orientation} tacticBaseline={game.tacticBaseline} />}
              </>
            )}
          </div>
          {board}
          <div className="game-review-notes-column">{noteCard}</div>
        </div>
      ) : (
        <>
          <div className={game.gameReport ? 'game-review-body mobile has-report-sheet' : 'game-review-body mobile'}>
            {noteCard}
            {board}
            <MoveNavStrip sanMoves={sanMoves} classifiedMoves={classifiedMoves} positions={positions} ply={ply} onSelect={setPly} />
          </div>
          {game.gameReport && (
            <div className="board-bottom-bar board-bottom-bar--report">
              <GameReportSummary report={game.gameReport} userColor={orientation} tacticBaseline={game.tacticBaseline} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
