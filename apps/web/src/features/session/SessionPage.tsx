import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCoachVoice } from '../../hooks/useCoachVoice.js';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import type { ArrowRef } from '../chat/arrowToken.js';
import { ChatComposer } from '../chat/ChatComposer.js';
import { ChatPane } from '../chat/ChatPane.js';
import { DebugPanel } from '../chat/DebugPanel.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import type { HoverMove } from '../chat/MessageList.js';
import { MessageNavPills } from '../chat/MessageNavPills.js';
import { PagedMessageCard } from '../chat/PagedMessageCard.js';
import { encodePositionContext, sanForPly } from '../chat/positionDivider.js';
import { SessionSummaryCard } from '../chat/SessionSummaryCard.js';
import { ThinkingIndicator } from '../chat/ThinkingIndicator.js';
import { ToolActivity } from '../chat/ToolActivity.js';
import { useMessagePaging } from '../chat/useMessagePaging.js';
import { SessionBoardColumn } from './SessionBoardColumn.js';
import { SessionHeader } from './SessionHeader.js';
import { useSessionPageData } from './useSessionPageData.js';
import './SessionPage.css';

/** design.md §5: composes board + chat for an active coaching session.
 * All fetching lives in useSessionPageData (AGENTS.md rule 7); this is
 * presentational — local UI state, a few small handlers, and the layout.
 * At/above 768px board and chat sit side by side (ChatPane's own full,
 * vertically-scrolling transcript). Below it, the exact same structure
 * GameReviewPage's mobile Review page landed on: one card above (there, the
 * current move's note; here, PagedMessageCard showing one transcript entry
 * at a time, paged left/right via MessageNavPills — not a scrolling list of
 * stacked messages), the board edge-to-edge below it, nav pills below the
 * board — see SessionPage.css's `.stacked` block for the full reasoning.
 * Not the two-tab Board/Coach switch BotSessionPage (a bot never talks, so
 * it keeps MobileSessionBody's tabs) still uses. ChatComposer is pinned to
 * the bottom of the screen rather than part of the stack (no
 * GameReviewPage equivalent — a read-only review has no reply): its
 * keyboard, opening from the card near the top, covers the board beneath
 * it rather than the conversation. */
export function SessionPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const navigate = useNavigate();
  const isSideBySide = useIsBoardSideBySide();
  const isDesktop = useIsDesktop();

  const {
    sessionQuery,
    profileQuery,
    gameQuery,
    sanMoves,
    positions,
    boardState,
    divergedLine,
    currentRealPosition,
    peekAt,
    autoplayIntervalMs,
    setAutoplayIntervalMs,
    engine,
    chat,
    handleReset,
    handlePlayMoveCommitted
  } = useSessionPageData(sessionId);

  const [boardArrows, setBoardArrows] = useState<ArrowRef[]>([]);
  const [hoverMove, setHoverMove] = useState<HoverMove>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  // Unconditional (hooks always are) — only the mobile branch below renders
  // PagedMessageCard/MessageNavPills off it.
  const messagePaging = useMessagePaging(chat.messages);
  const persona = profileQuery.data?.coachPersona ?? 'general';
  const ttsEnabled = profileQuery.data?.ttsEnabled ?? false;
  const ttsBackend = profileQuery.data?.ttsBackend ?? 'openai';
  const coachVoice = useCoachVoice({
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    persona,
    enabled: ttsEnabled,
    backend: ttsBackend
  });

  if (sessionQuery.isLoading || gameQuery.isLoading) return <p>Loading…</p>;
  if (sessionQuery.isError || !sessionQuery.data) return <p>Could not load this session.</p>;

  const session = sessionQuery.data;

  if (session.status === 'completed') {
    return (
      <SessionSummaryCard
        summary={session.summary ?? ''}
        homework={session.homework}
        onBackToGames={() => navigate('/games')}
        onViewProgress={() => navigate('/dashboard')}
      />
    );
  }

  if (session.status === 'abandoned') {
    return (
      <div className="session-summary-card">
        <p>This session was reset.</p>
        <button type="button" onClick={() => navigate('/games')}>
          Back to Games
        </button>
      </div>
    );
  }

  function handleSendMessage(content: string): void {
    if (divergedLine.line) {
      void chat.sendMessage(encodeDivergedLine(divergedLine.line, content));
      // The line stays active — the coach may continue the hypothetical.
      return;
    }
    if (boardState.mode === 'peek') {
      const san = sanForPly(sanMoves, boardState.ply) ?? '';
      void chat.sendMessage(encodePositionContext(boardState.ply, san, content));
      boardState.anchorHere();
      return;
    }
    void chat.sendMessage(content);
  }

  const orientation = gameQuery.data?.userColor ?? 'white';
  const hasCompletedTurn = chat.messages.some((message) => message.role === 'assistant' && message.text !== '');
  // Same fen SessionBoardColumn computes for the board itself — needed here
  // too so ChatPane can resolve move mentions against the position actually
  // on screen (design.md §5.3), and so the mobile peek shows it.
  const fen = divergedLine.fen ?? boardState.fen;

  const board = (
    <SessionBoardColumn
      boardState={boardState}
      divergedLine={divergedLine}
      currentRealPosition={currentRealPosition}
      orientation={orientation}
      sanMoves={sanMoves}
      positions={positions}
      classifiedMoves={gameQuery.data?.classifiedMoves}
      isDesktop={isDesktop}
      isSideBySide={isSideBySide}
      engine={engine}
      autoplayIntervalMs={autoplayIntervalMs}
      onChangeAutoplayInterval={setAutoplayIntervalMs}
      sendMessage={(content) => void chat.sendMessage(content)}
      onArrowsChange={setBoardArrows}
      hoverMove={hoverMove}
      sessionMode={session.mode}
      sessionId={sessionId}
      onPlayMoveCommitted={handlePlayMoveCommitted}
    />
  );

  const isPausedNoCredits = session.status === 'paused_no_credits';
  const pausedCard = (
    <div className="session-paused-card">
      <p>The session is saved. Add credits or your own API key to continue.</p>
      <button type="button" onClick={() => navigate('/settings')}>
        Add credits
      </button>
    </div>
  );

  const chatPanel = isPausedNoCredits ? (
    pausedCard
  ) : (
    <ChatPane
      messages={chat.messages}
      activeToolName={chat.activeToolName}
      isThinking={chat.isThinking}
      onSend={handleSendMessage}
      onSelectPly={peekAt}
      boardArrows={boardArrows}
      hasPendingLine={Boolean(divergedLine.line)}
      fen={fen}
      positions={positions}
      onHoverMove={setHoverMove}
      coachPersona={persona}
      autoplayEnabled={coachVoice.autoplayEnabled}
      onToggleAutoplay={ttsEnabled ? coachVoice.setAutoplayEnabled : undefined}
      onPlayMessage={ttsEnabled ? coachVoice.play : undefined}
      onStopMessage={ttsEnabled ? coachVoice.stop : undefined}
      playingMessageId={coachVoice.playingMessageId}
      loadingMessageId={coachVoice.loadingMessageId}
    />
  );

  return (
    <div className="session-page">
      <SessionHeader
        whiteName={gameQuery.data?.whiteName ?? null}
        blackName={gameQuery.data?.blackName ?? null}
        result={gameQuery.data?.result ?? null}
        onBack={() => navigate('/games')}
        onReset={handleReset}
        onDebug={import.meta.env.DEV ? () => setIsDebugOpen(true) : undefined}
        debugDisabled={!hasCompletedTurn}
      />
      {isDebugOpen && <DebugPanel sessionId={sessionId} onClose={() => setIsDebugOpen(false)} />}
      {isSideBySide ? (
        <div className="session-body desktop">
          {isDesktop &&
            (divergedLine.line ? (
              <DivergedLinePanel
                line={divergedLine.line}
                stepIndex={divergedLine.stepIndex}
                onSelectStep={divergedLine.previewStep}
                onExit={divergedLine.exit}
                autoplayIntervalMs={autoplayIntervalMs}
                onChangeAutoplayInterval={setAutoplayIntervalMs}
              />
            ) : (
              <div className="session-move-explorer-column">
                <MoveExplorer
                  sanMoves={sanMoves}
                  classifiedMoves={gameQuery.data?.classifiedMoves ?? []}
                  positions={positions}
                  currentPly={boardState.ply}
                  onSelect={peekAt}
                />
                {gameQuery.data?.gameReport && <GameReportSummary report={gameQuery.data.gameReport} userColor={orientation} />}
              </div>
            ))}
          {board}
          {chatPanel}
        </div>
      ) : isPausedNoCredits ? (
        pausedCard
      ) : (
        <div className="session-body mobile stacked">
          <PagedMessageCard
            message={messagePaging.current}
            index={messagePaging.index}
            visible={messagePaging.visible}
            fen={fen}
            positions={positions}
            onSelectPly={peekAt}
            onHoverMove={setHoverMove}
            coachPersona={persona}
            onPlayMessage={ttsEnabled ? coachVoice.play : undefined}
            onStopMessage={ttsEnabled ? coachVoice.stop : undefined}
            playingMessageId={coachVoice.playingMessageId}
            loadingMessageId={coachVoice.loadingMessageId}
          />
          <ThinkingIndicator visible={chat.isThinking} />
          <ToolActivity toolName={chat.activeToolName} />
          {board}
          <MessageNavPills index={messagePaging.index} total={messagePaging.total} onSelect={messagePaging.goTo} />
          <div className="session-composer-fixed">
            <ChatComposer onSend={handleSendMessage} boardArrows={boardArrows} hasPendingLine={Boolean(divergedLine.line)} collapsible />
          </div>
        </div>
      )}
    </div>
  );
}
