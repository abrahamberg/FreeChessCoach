import { isTopReviewTier } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { MoveStrip } from '../board/MoveStrip.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { SessionHeader } from '../session/SessionHeader.js';
import { GameReviewBoardColumn } from './GameReviewBoardColumn.js';
import { MoveNoteCard } from './MoveNoteCard.js';
import { useGameReviewPageData } from './useGameReviewPageData.js';
import './GameReviewPage.css';

/** The static, move-by-move Game Report review — chess.com-style "Review",
 * distinct from the Coach tab's live LLM conversation (architecture: Games
 * page tabs/promotion). No chat, no coach turn, nothing that spends a
 * credit: every note here is the same pre-baked, deterministic text
 * (move-reasons.ts/describe-tactic-hit.ts) already stored on the analysis.
 * "Continue with Coach" is the one bridge to the paid conversation, and it's
 * the only mutation this page makes.
 *
 * Below the desktop breakpoint, this follows chess.com's own mobile review
 * layout (Daniel's reference): the note for the current move is a dominant
 * card above the board, not a small aside below a move list — a compact
 * horizontal MoveStrip (not the full paired move list) handles navigation,
 * so the note never has to compete with a long list for vertical space.
 *
 * At the desktop breakpoint, the note card takes the same MoveNoteCard the
 * mobile layout uses, placed in the column a coaching session's chat pane
 * would occupy — explorer/game-report keep their normal session-page
 * position on the left rather than swapping sides. */
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
    isAnchoredPreMove,
    revealPlayedMove,
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
      arrows={arrows}
      classifiedMoves={classifiedMoves}
      sanMoves={sanMoves}
      ply={ply}
      onSelect={setPly}
      isAnchoredPreMove={isAnchoredPreMove}
      onReveal={revealPlayedMove}
      isDesktop={isDesktop}
    />
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
          {/* Same three-column arrangement the coaching session uses
              (SessionPage.css's session-move-explorer-column/chat-pane) —
              explorer + game report stay on the left where they normally
              sit; the note card takes the right column a chat pane would
              occupy in a coaching session, rather than displacing either. */}
          <div className="game-review-explorer-column">
            <MoveExplorer sanMoves={sanMoves} classifiedMoves={classifiedMoves} positions={positions} currentPly={ply} onSelect={setPly} />
            {game.gameReport && <GameReportSummary report={game.gameReport} userColor={orientation} />}
          </div>
          {board}
          <div className="game-review-notes-column">
            <MoveNoteCard ply={ply} san={sanMoves[ply - 1] ?? null} move={currentMove} />
          </div>
        </div>
      ) : (
        <div className="game-review-body mobile">
          <MoveNoteCard ply={ply} san={sanMoves[ply - 1] ?? null} move={currentMove} />
          {board}
          {/* MoveStrip's own currentPly/onSelect are the sanMoves array index
              (0-based — confirmed by its tests), not the 1-based halfmove ply
              `ply`/`setPly` use everywhere else on this page (matching
              `positions[].ply`, ply 0 = start position) — hence the +/-1
              translation at this one boundary. */}
          <MoveStrip
            sanMoves={sanMoves}
            classifiedMoves={classifiedMoves}
            positions={positions}
            currentPly={ply - 1}
            momentPlies={[]}
            onSelect={(index) => setPly(index + 1)}
          />
          {game.gameReport && <GameReportSummary report={game.gameReport} userColor={orientation} />}
        </div>
      )}
    </div>
  );
}
