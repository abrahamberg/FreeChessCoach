import { isTopReviewTier } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { describePly, sanForPly } from '../chat/positionDivider.js';
import { SessionHeader } from '../session/SessionHeader.js';
import { GameReviewBoardColumn } from './GameReviewBoardColumn.js';
import { MobileReviewBody } from './MobileReviewBody.js';
import { useGameReviewPageData } from './useGameReviewPageData.js';
import { useMobileReviewView } from './useMobileReviewView.js';
import './GameReviewPage.css';

/** What the mobile notes panel's peek bar names as "currently on the board"
 * — same move-pair formatting SessionPeekBar's own boardContextLabel uses,
 * just without that helper's mode/diverged-line concerns (Review has
 * neither). */
function positionLabel(ply: number, sanMoves: string[]): string {
  const san = sanForPly(sanMoves, ply);
  if (ply <= 0 || !san) return 'start position';
  const { moveNumber, color } = describePly(ply);
  return `${moveNumber}${color === 'white' ? '.' : '…'}${san}`;
}

/** The static, move-by-move Game Report review — chess.com-style "Review",
 * distinct from the Coach tab's live LLM conversation (architecture: Games
 * page tabs/promotion). No chat, no coach turn, nothing that spends a
 * credit: every note here is the same pre-baked, deterministic text
 * (move-reasons.ts/describe-tactic-hit.ts) already stored on the analysis.
 * "Continue with Coach" is the one bridge to the paid conversation, and it's
 * the only mutation this page makes.
 *
 * Below the desktop breakpoint, board and notes are two full-screen panels
 * behind a Board/Notes segmented control (MobileReviewBody) rather than one
 * long scroll — the notes are the point of Review, so they get their own
 * reachable panel instead of sitting under a possibly-tall board. */
export function GameReviewPage(): ReactNode {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const mobileView = useMobileReviewView();
  const {
    gameQuery,
    positions,
    sanMoves,
    classifiedMoves,
    ply,
    setPly,
    fen,
    highlights,
    continueWithCoach,
    isContinuingWithCoach,
    continueWithCoachError
  } = useGameReviewPageData(gameId ?? '');

  if (gameQuery.isLoading) return <p>Loading…</p>;
  if (gameQuery.isError || !gameQuery.data) return <p>Could not load this game.</p>;

  const game = gameQuery.data;
  const orientation = game.userColor;

  const board = (
    <GameReviewBoardColumn
      fen={fen}
      orientation={orientation}
      highlights={highlights}
      classifiedMoves={classifiedMoves}
      ply={ply}
      onSelect={setPly}
      isDesktop={isDesktop}
    />
  );

  const report = (
    <>
      <MoveExplorer sanMoves={sanMoves} classifiedMoves={classifiedMoves} positions={positions} currentPly={ply} onSelect={setPly} />
      {game.gameReport && <GameReportSummary report={game.gameReport} userColor={orientation} />}
    </>
  );

  return (
    <div className="game-review-page">
      <SessionHeader whiteName={game.whiteName} blackName={game.blackName} result={game.result} onBack={() => navigate('/games')} />
      {!isTopReviewTier(game.reviewTier) && game.analysisStatus === 'ready' && (
        <div className="game-review-page__actions">
          <button type="button" className="btn-primary" onClick={continueWithCoach} disabled={isContinuingWithCoach}>
            {isContinuingWithCoach ? 'Starting coaching session…' : 'Continue with Coach'}
          </button>
          {continueWithCoachError && <p role="alert">Could not start a coaching session — try again.</p>}
        </div>
      )}
      {isDesktop ? (
        <div className="game-review-body desktop">
          {board}
          <div className="game-review-explorer-column">{report}</div>
        </div>
      ) : (
        <MobileReviewBody board={board} notes={report} fen={fen} positionLabel={positionLabel(ply, sanMoves)} viewState={mobileView} />
      )}
    </div>
  );
}
