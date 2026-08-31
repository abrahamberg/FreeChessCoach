import { findBotConfig } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { useShowStatusBar } from '../../hooks/useShowStatusBar.js';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { SessionSummaryCard } from '../chat/SessionSummaryCard.js';
import { sanForPly } from '../chat/positionDivider.js';
import { BotStatusPanel } from './BotStatusPanel.js';
import { MobileSessionBody } from './MobileSessionBody.js';
import { SessionBoardColumn } from './SessionBoardColumn.js';
import { SessionHeader } from './SessionHeader.js';
import { useBotSessionPageData } from './useBotSessionPageData.js';
import { useMobileSessionView } from './useMobileSessionView.js';
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
 */
export function BotSessionPage({ sessionId }: BotSessionPageProps): ReactNode {
  const navigate = useNavigate();
  const isSideBySide = useIsBoardSideBySide();
  const isDesktop = useIsDesktop();
  const mobileView = useMobileSessionView(0);
  const [showStatusBar, setShowStatusBar] = useShowStatusBar();

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
    engine,
    handleBotMoveCommitted,
    handleGameOver,
    undoLastMove,
    canUndo,
    resign,
    isResigning,
    clock,
    onClockUpdate,
    claimTimeout
  } = useBotSessionPageData(sessionId);

  if (sessionQuery.isLoading || gameQuery.isLoading) return <p>Loading…</p>;
  if (sessionQuery.isError || !sessionQuery.data) return <p>Could not load this game.</p>;

  const session = sessionQuery.data;

  if (session.status === 'completed') {
    return (
      <SessionSummaryCard
        summary={session.summary ?? 'Game over.'}
        homework={session.homework}
        onBackToGames={() => navigate('/games')}
        onViewProgress={() => navigate('/dashboard')}
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
  const botName = (orientation === 'white' ? gameQuery.data?.blackName : gameQuery.data?.whiteName) ?? 'The bot';
  const bot = gameQuery.data?.botId ? findBotConfig(gameQuery.data.botId) : undefined;
  const isPlayerTurn = boardState.ply % 2 === (orientation === 'white' ? 0 : 1);
  const fen = divergedLine.fen ?? boardState.fen;
  // The clock cares about whose turn it REALLY is, not wherever boardState
  // happens to be peeking into history — currentRealPosition tracks that.
  const activeColor: 'white' | 'black' = currentRealPosition.ply % 2 === 0 ? 'white' : 'black';

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
      classifiedMoves={classifiedMoves}
      isDesktop={isDesktop}
      engine={engine}
      autoplayIntervalMs={autoplayIntervalMs}
      onChangeAutoplayInterval={setAutoplayIntervalMs}
      sendMessage={() => undefined}
      onArrowsChange={() => undefined}
      sessionMode="play_bot"
      sessionId={sessionId}
      onPlayMoveCommitted={handleBotMoveCommitted}
      onGameOver={handleGameOver}
      onUndoMove={undoLastMove}
      undoDisabled={!canUndo}
      onClockUpdate={onClockUpdate}
      showEvalIndicators={showStatusBar}
    />
  );

  const statusPanel = showStatusBar && (
    <BotStatusPanel
      botName={botName}
      botAvatarIndex={bot?.avatarIndex}
      botElo={bot?.elo}
      isPlayerTurn={isPlayerTurn}
      gameOver={null}
      userColor={orientation}
      onResign={isResigning ? undefined : handleResign}
      clock={clock}
      activeColor={activeColor}
      onClockExpire={claimTimeout}
    />
  );

  return (
    <div className="session-page">
      <SessionHeader
        whiteName={gameQuery.data?.whiteName ?? null}
        blackName={gameQuery.data?.blackName ?? null}
        result={gameQuery.data?.result ?? null}
        onBack={() => navigate('/games')}
        extraItems={[{ label: showStatusBar ? 'Hide status bar' : 'Show status bar', onSelect: () => setShowStatusBar(!showStatusBar) }]}
      />
      {isSideBySide ? (
        <div className="session-body desktop">
          {isDesktop && (
            <div className="session-move-explorer-column">
              <MoveExplorer sanMoves={sanMoves} classifiedMoves={classifiedMoves ?? []} positions={positions} currentPly={boardState.ply} onSelect={peekAt} />
              {gameQuery.data?.gameReport && <GameReportSummary report={gameQuery.data.gameReport} userColor={orientation} />}
            </div>
          )}
          {board}
          {statusPanel}
        </div>
      ) : (
        <MobileSessionBody
          board={board}
          chat={statusPanel}
          fen={fen}
          boardContext={{
            mode: boardState.mode,
            ply: boardState.ply,
            san: sanForPly(sanMoves, boardState.ply),
            hasDivergedLine: false,
            isAnchoredPreMove: boardState.isAnchoredPreMove
          }}
          viewState={mobileView}
        />
      )}
    </div>
  );
}
