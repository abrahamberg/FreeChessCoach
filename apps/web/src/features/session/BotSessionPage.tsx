import { findBotConfig } from '@freechesscoach/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OverflowMenuItem } from '../../components/OverflowMenu.js';
import { ENGINE_MODE_BADGE, useEngineActivityIndicator } from '../../hooks/useEngineActivityIndicator.js';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { useShowStatusBar } from '../../hooks/useShowStatusBar.js';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { useExploreFeedback } from '../board/useExploreFeedback.js';
import { SessionSummaryCard } from '../chat/SessionSummaryCard.js';
import { BotStatusPanel } from './BotStatusPanel.js';
import { GameOverDialog } from './GameOverDialog.js';
import { SessionBoardColumn } from './SessionBoardColumn.js';
import { SessionHeader } from './SessionHeader.js';
import { StackedSessionBody } from './StackedSessionBody.js';
import { useBotSessionPageData } from './useBotSessionPageData.js';
import '../../styles/board-bottom-bar.css';
import './SessionPage.css';

export interface BotSessionPageProps {
  sessionId: string;
}

/**
 * "Play vs Bot" plan: the chat-less sibling of SessionPage — same board
 * mechanics (SessionBoardColumn, unchanged), but no ChatPane/useCoachChat at
 * all, since a bot never talks. Deliberately a separate component (not a
 * branch inside SessionPage) so useCoachChat's SSE/tool-calling machinery,
 * which has no meaning here, is never constructed for a bot game.
 *
 * Below the side-by-side breakpoint this used to be a Board/Coach tab
 * switch (MobileSessionBody) — replaced with StackedSessionBody, the same
 * "compact card above an edge-to-edge board" shape SessionPage's own
 * coaching session and GameReviewPage's Review page already use: a bot game
 * has no transcript to page through, so BotStatusPanel's own status
 * (`variant="card"`) is that card, board and status both on screen at once
 * instead of a tab away from each other.
 */
export function BotSessionPage({ sessionId }: BotSessionPageProps): ReactNode {
  const navigate = useNavigate();
  const isSideBySide = useIsBoardSideBySide();
  const isDesktop = useIsDesktop();
  const [showStatusBar, setShowStatusBar] = useShowStatusBar();
  // AppShell hides its own top bar (Settings, the engine indicator) for
  // every board route — SessionHeader's own overflow menu is the only place
  // left to reach them from here (design ask: nothing this page needs
  // should be unreachable just because it's a board route).
  const engineActivity = useEngineActivityIndicator();
  // Dismisses GameOverDialog while leaving gameOverInfo itself alone — the
  // board/status panel below key off gameOverInfo (not this) to keep
  // rendering the finished game rather than swapping to SessionSummaryCard.
  const [dialogDismissed, setDialogDismissed] = useState(false);
  // Lifted here (not local to SessionBoardColumn) because BotStatusPanel,
  // which renders the "{bot} is thinking…" text, is that column's sibling —
  // see SessionBoardColumn's onBotThinkingChange doc comment.
  const [isBotThinking, setIsBotThinking] = useState(false);

  const {
    sessionQuery,
    gameQuery,
    sanMoves,
    positions,
    classifiedMoves,
    boardState,
    divergedLine,
    currentRealPosition,
    peekAt,
    autoplayIntervalMs,
    setAutoplayIntervalMs,
    handleBotMoveCommitted,
    handleGameOver,
    gameOverInfo,
    undoLastMove,
    canUndo,
    resign,
    isResigning,
    clock,
    onClockUpdate,
    onBotTurnStart,
    claimTimeout,
    setBotThinkingLog
  } = useBotSessionPageData(sessionId);

  // "Explore on your own" (BoardActionBar's eye toggle) — same ownership
  // split SessionPage.tsx uses (isExploring lives above SessionBoardColumn,
  // not inside it, since it's a plain useState here with nowhere else to
  // live for a chat-less page).
  const fen = divergedLine.fen ?? boardState.fen;
  const [isExploring, setIsExploring] = useState(false);
  useEffect(() => {
    if (boardState.mode !== 'peek') setIsExploring(false);
  }, [boardState.mode]);
  // The student's move has been sent: bank their clock and start the bot's.
  const studentColor = gameQuery.data?.userColor;
  useEffect(() => {
    if (isBotThinking && studentColor) onBotTurnStart(studentColor);
  }, [isBotThinking, studentColor, onBotTurnStart]);
  const exploreFeedback = useExploreFeedback({ enabled: isExploring, fen, lastMove: boardState.lastLocalMove });
  function openExplore(): void {
    setIsExploring(true);
    boardState.setMode('peek');
  }

  if (sessionQuery.isLoading || gameQuery.isLoading) return <p>Loading…</p>;
  if (sessionQuery.isError || !sessionQuery.data) return <p>Could not load this game.</p>;

  const session = sessionQuery.data;

  // A cold-loaded already-finished game (no live gameOverInfo from this page
  // visit) still gets the old summary-card treatment — there's no in-context
  // board state to preserve there. A game that just ended THIS visit
  // (gameOverInfo set) instead stays on the board with GameOverDialog below,
  // which is the whole point of this component still existing: it no longer
  // yanks the student away from the game the instant it ends.
  if (session.status === 'completed' && !gameOverInfo) {
    return (
      <SessionSummaryCard
        summary={session.summary ?? 'Game over.'}
        homework={session.homework}
        onBackToGames={() => navigate('/games')}
        onViewProgress={() => navigate('/progress')}
      />
    );
  }

  if (session.status === 'abandoned') {
    return (
      <div className="session-summary-card">
        <p>This game was reset.</p>
        <button type="button" onClick={() => navigate('/games')}>
          Back to Games
        </button>
      </div>
    );
  }

  const orientation = gameQuery.data?.userColor ?? 'white';
  // A rated game: no move feedback, eval, hints, undo, Explore or thinking log.
  const isRated = gameQuery.data?.rated === true;
  const shownMoves = isRated ? null : classifiedMoves;
  const botName = (orientation === 'white' ? gameQuery.data?.blackName : gameQuery.data?.whiteName) ?? 'The bot';
  const bot = gameQuery.data?.botId ? findBotConfig(gameQuery.data.botId) : undefined;
  const isPlayerTurn = boardState.ply % 2 === (orientation === 'white' ? 0 : 1);
  // The clock cares about whose turn it REALLY is, not wherever boardState
  // happens to be peeking into history — currentRealPosition tracks that.
  // While the student's move is still round-tripping, the bot's clock is the
  // one running (the board only catches up when the bot's reply lands).
  const botColor = orientation === 'white' ? 'black' : 'white';
  const activeColor: 'white' | 'black' = isBotThinking ? botColor : currentRealPosition.ply % 2 === 0 ? 'white' : 'black';

  function handleResign(): void {
    if (window.confirm(`Resign this game against ${botName}?`)) resign();
  }

  const board = (
    <SessionBoardColumn
      boardState={boardState}
      divergedLine={divergedLine}
      currentRealPosition={currentRealPosition}
      orientation={orientation}
      sanMoves={sanMoves}
      positions={positions}
      classifiedMoves={shownMoves}
      isDesktop={isDesktop}
      autoplayIntervalMs={autoplayIntervalMs}
      onChangeAutoplayInterval={setAutoplayIntervalMs}
      sendMessage={() => undefined}
      onArrowsChange={() => undefined}
      sessionMode="play_bot"
      sessionId={sessionId}
      onPlayMoveCommitted={handleBotMoveCommitted}
      onGameOver={handleGameOver}
      onBotThinkingChange={setIsBotThinking}
      onUndoMove={isRated ? undefined : undoLastMove}
      restricted={isRated}
      undoDisabled={!canUndo || session.status !== 'active'}
      onClockUpdate={onClockUpdate}
      showEvalIndicators={showStatusBar && !isRated}
      // The game itself has no more moves to accept once it's over — without
      // this a resignation/timeout ending (unlike checkmate/stalemate, which
      // already has no legal moves) would otherwise leave a fully-playable-
      // looking board that just bounces every drop off a 422.
      boardDisabled={session.status !== 'active'}
      isExploring={isExploring}
      onOpenExplore={openExplore}
      onCloseExplore={boardState.backToCoach}
      exploreFeedback={exploreFeedback}
    />
  );

  // Shared between desktop's full panel and mobile's compact card — same
  // status, just re-homed (BotStatusPanel's `variant` prop) for each layout.
  // The Thinking log is opt-in per session (0043_bot_thinking_log.ts, its
  // ⋯-menu item below): a disabled session renders no log and records no
  // traces server-side, which is the default for every new bot game.
  const thinkingLogEnabled = session.botThinkingLog && !isRated;
  const statusPanelProps = {
    botName,
    botAvatarIndex: bot?.avatarIndex,
    botElo: bot?.elo,
    isPlayerTurn,
    isBotThinking,
    gameOver: gameOverInfo,
    userColor: orientation,
    onResign: isResigning ? undefined : handleResign,
    clock,
    activeColor,
    onClockExpire: claimTimeout,
    fen,
    sessionId,
    thinkingLogEnabled
  };
  const statusPanel = showStatusBar && <BotStatusPanel {...statusPanelProps} />;
  const statusCard = showStatusBar && <BotStatusPanel {...statusPanelProps} variant="card" />;
  // Mobile's own bottom sheet for the same report the desktop sidebar
  // already shows once it exists (below) — absent while the game is still
  // in progress, same as desktop.
  const reportFooter = gameQuery.data?.gameReport && <GameReportSummary report={gameQuery.data.gameReport} userColor={orientation} />;
  const engineBadge = engineActivity.engineMode ? ENGINE_MODE_BADGE[engineActivity.engineMode] : 'Engine';
  const headerExtraItems: OverflowMenuItem[] = [
    { label: showStatusBar ? 'Hide status bar' : 'Show status bar', onSelect: () => setShowStatusBar(!showStatusBar) },
    ...(isRated ? [] : [{ label: thinkingLogEnabled ? 'Hide thinking log' : 'Show thinking log', onSelect: () => setBotThinkingLog(!thinkingLogEnabled) }]),
    { label: `Engine: ${engineBadge}`, onSelect: () => navigate('/settings#settings-engine') },
    { label: 'Settings', onSelect: () => navigate('/settings') }
  ];

  return (
    <div className="session-page">
      <SessionHeader
        whiteName={gameQuery.data?.whiteName ?? null}
        blackName={gameQuery.data?.blackName ?? null}
        result={gameQuery.data?.result ?? null}
        onBack={() => navigate('/games')}
        extraItems={headerExtraItems}
      />
      {isSideBySide ? (
        <div className="session-body desktop">
          {isDesktop && (
            <div className="session-move-explorer-column">
              <MoveExplorer sanMoves={sanMoves} classifiedMoves={shownMoves ?? []} positions={positions} currentPly={boardState.ply} onSelect={peekAt} />
              {gameQuery.data?.gameReport && <GameReportSummary report={gameQuery.data.gameReport} userColor={orientation} />}
            </div>
          )}
          {board}
          {statusPanel}
        </div>
      ) : (
        <StackedSessionBody card={statusCard} board={board} footer={reportFooter} footerKind="report" />
      )}
      {gameOverInfo && !dialogDismissed && (
        <GameOverDialog
          gameOver={gameOverInfo}
          gameId={session.gameId}
          userColor={orientation}
          botName={botName}
          onContinue={() => setDialogDismissed(true)}
          onDone={() => navigate('/games')}
        />
      )}
    </div>
  );
}
