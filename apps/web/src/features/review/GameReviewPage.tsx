import { isTopReviewTier } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { MoveStrip } from '../board/MoveStrip.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { SessionHeader } from '../session/SessionHeader.js';
import { GameReviewBoardColumn } from './GameReviewBoardColumn.js';
import { MoveNavPills } from './MoveNavPills.js';
import { MoveNoteCard } from './MoveNoteCard.js';
import { useGameReviewPageData } from './useGameReviewPageData.js';
import './GameReviewPage.css';

/** The static, move-by-move Game Report review — chess.com-style "Review",
 * distinct from the Coach tab's live LLM conversation (architecture: Games
 * page tabs/promotion). No chat, no coach turn, nothing that spends a
 * credit: every note here is the same pre-baked, deterministic text
 * (move-reasons.ts/describe-tactic-hit.ts) already stored on the analysis.
 * "Continue with Coach" is the one bridge to the paid conversation — a
 * small icon in MoveNoteCard's own header — and the only mutation this page
 * makes.
 *
 * Below the desktop breakpoint: note card, nav pills, MoveStrip, then the
 * board, as one fixed (non-scrolling) layout — the board's position and
 * size stay put regardless of how long the current move's note is (the
 * note card scrolls internally instead), rather than the whole page
 * scrolling and the board landing wherever that leaves it. Game Report is
 * a bottom sheet (GameReportSummary's own existing expand/collapse state,
 * just given fixed/overlay positioning here) rather than another flex
 * child, so opening it covers the board instead of pushing it around.
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
  const {
    gameQuery,
    positions,
    sanMoves,
    classifiedMoves,
    currentMove,
    ply,
    setPly,
    fen,
    highlights,
    arrows,
    moveQualityBadgeSquare,
    tacticSelection,
    onToggleTacticSelection,
    continueWithCoach,
    isContinuingWithCoach,
    continueWithCoachError
  } = useGameReviewPageData(gameId ?? '');

  if (gameQuery.isLoading) return <p>Loading…</p>;
  if (gameQuery.isError || !gameQuery.data) return <p>Could not load this game.</p>;

  const game = gameQuery.data;
  const orientation = game.userColor;
  const canContinueWithCoach = !isTopReviewTier(game.reviewTier) && game.analysisStatus === 'ready';

  const board = (
    <GameReviewBoardColumn
      fen={fen}
      orientation={orientation}
      highlights={highlights}
      arrows={arrows}
      moveQualityBadgeSquare={moveQualityBadgeSquare}
      classifiedMoves={classifiedMoves}
      ply={ply}
      onSelect={setPly}
      isDesktop={isDesktop}
    />
  );

  const noteCard = (
    <MoveNoteCard
      ply={ply}
      san={sanMoves[ply - 1] ?? null}
      move={currentMove}
      onContinueWithCoach={canContinueWithCoach ? continueWithCoach : undefined}
      isContinuingWithCoach={isContinuingWithCoach}
      tacticSelection={tacticSelection}
      onToggleTacticSelection={onToggleTacticSelection}
    />
  );

  return (
    <div className="game-review-page">
      <SessionHeader whiteName={game.whiteName} blackName={game.blackName} result={game.result} onBack={() => navigate('/games')} />
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
            <MoveExplorer
              sanMoves={sanMoves}
              classifiedMoves={classifiedMoves}
              positions={positions}
              currentPly={ply}
              onSelect={setPly}
              showNotes={false}
            />
            {game.gameReport && <GameReportSummary report={game.gameReport} userColor={orientation} tacticBaseline={game.tacticBaseline} />}
          </div>
          {board}
          <div className="game-review-notes-column">{noteCard}</div>
        </div>
      ) : (
        <>
          <div className={game.gameReport ? 'game-review-body mobile has-report-sheet' : 'game-review-body mobile'}>
            {noteCard}
            <MoveNavPills ply={ply} totalPlies={sanMoves.length} onSelect={setPly} />
            {/* MoveStrip's own currentPly/onSelect are the sanMoves array
                index (0-based — confirmed by its tests), not the 1-based
                halfmove ply `ply`/`setPly` use everywhere else on this page
                (matching `positions[].ply`, ply 0 = start position) —
                hence the +/-1 translation at this one boundary. */}
            <MoveStrip
              sanMoves={sanMoves}
              classifiedMoves={classifiedMoves}
              positions={positions}
              currentPly={ply - 1}
              momentPlies={[]}
              onSelect={(index) => setPly(index + 1)}
            />
            {board}
          </div>
          {game.gameReport && (
            <div className="game-review-report-sheet">
              <GameReportSummary report={game.gameReport} userColor={orientation} tacticBaseline={game.tacticBaseline} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
