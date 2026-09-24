import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { OverflowMenuItem } from '../../components/OverflowMenu.js';
import { useCoachVoice } from '../../hooks/useCoachVoice.js';
import { useLlmSetupStatus } from '../../hooks/useLlmSetupStatus.js';
import { isOpenAiVoiceAvailable } from '../../tts/openai-voice-available.js';
import { ENGINE_MODE_BADGE, useEngineActivityIndicator } from '../../hooks/useEngineActivityIndicator.js';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { GameReportSummary } from '../board/GameReportSummary.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { useExploreFeedback } from '../board/useExploreFeedback.js';
import type { ArrowRef } from '../chat/arrowToken.js';
import { ChatPane } from '../chat/ChatPane.js';
import { DebugPanel } from '../chat/DebugPanel.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import type { HoverMove } from '../chat/MessageList.js';
import { encodePositionContext, sanForPly } from '../chat/positionDivider.js';
import { SessionSummaryCard } from '../chat/SessionSummaryCard.js';
import { useMessagePaging } from '../chat/useMessagePaging.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { UnlockPhraseModal } from '../settings/UnlockPhraseModal.js';
import { MobileCoachSessionBody } from './MobileCoachSessionBody.js';
import { SessionBoardColumn } from './SessionBoardColumn.js';
import { SessionHeader } from './SessionHeader.js';
import { useSessionPageData } from './useSessionPageData.js';
import '../../styles/board-bottom-bar.css';
import './SessionPage.css';

/** design.md §5: composes board + chat for an active coaching session.
 * All fetching lives in useSessionPageData (AGENTS.md rule 7); this is
 * presentational — local UI state, a few small handlers, and the layout.
 * At/above 768px board and chat sit side by side (ChatPane's own full,
 * vertically-scrolling transcript); below it, MobileCoachSessionBody's own
 * StackedSessionBody layout (its doc comment has the design reasoning) —
 * the same shape BotSessionPage's mobile layout now uses too, with a
 * compact BotStatusPanel card in place of PagedMessageCard. */
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
    chat,
    unlockModal,
    setupRequiredModal,
    handleReset,
    handlePlayMoveCommitted,
    undoLastMove,
    canUndo
  } = useSessionPageData(sessionId);

  const [boardArrows, setBoardArrows] = useState<ArrowRef[]>([]);
  const [hoverMove, setHoverMove] = useState<HoverMove>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  // Same fen SessionBoardColumn computes for the board itself — needed here
  // too so ChatPane can resolve move mentions against the position actually
  // on screen (design.md §5.3), so the mobile peek shows it, and now to
  // drive the Explore sandbox's own engine-pipeline feedback (below), which
  // both SessionBoardColumn (board arrows/EvalBar) and
  // MobileCoachSessionBody (the mobile "coach box" swap) need — lifted up
  // to their common ancestor rather than owned inside either sibling.
  const fen = divergedLine.fen ?? boardState.fen;
  const [isExploring, setIsExploring] = useState(false);
  // Leaving peek mode any other way (the peek pill's "back to coach", a new
  // coach show_position, the move strip) must collapse this too — otherwise
  // its pill/note stay stuck on screen even once the coach is watching
  // again.
  useEffect(() => {
    if (boardState.mode !== 'peek') setIsExploring(false);
  }, [boardState.mode]);
  const exploreFeedback = useExploreFeedback({ enabled: isExploring, fen, lastMove: boardState.lastLocalMove });
  function openExplore(): void {
    setIsExploring(true);
    boardState.setMode('peek');
  }
  // AppShell hides its own top bar (Settings, the engine indicator) for
  // every board route, session included — SessionHeader's own overflow menu
  // is the only place left to reach them, and the coach voice autoplay
  // toggle, from here (design ask: nothing this page needs should be
  // unreachable just because it's a board route).
  const engineActivity = useEngineActivityIndicator();
  // Unconditional (hooks always are) — only the mobile branch below renders
  // PagedMessageCard/MessageNavPills off it.
  const messagePaging = useMessagePaging(chat.messages);
  const persona = profileQuery.data?.coachPersona ?? 'general';
  const ttsEnabled = profileQuery.data?.ttsEnabled ?? false;
  const llmSetupQuery = useLlmSetupStatus();
  const savedTtsBackend = profileQuery.data?.ttsBackend ?? 'openai';
  const ttsBackend = savedTtsBackend === 'openai' && !isOpenAiVoiceAvailable(llmSetupQuery.data) ? 'browser' : savedTtsBackend;
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

  // A completed session used to hard-swap the whole board+chat for this
  // card, a dead end with no way to ask a follow-up. Nothing server-side
  // ever gated POST /messages on status (routes/sessions.ts) — the coach's
  // own closing line (coach-session-flow.ts) is now what tells the student
  // the session is over, so this renders as a banner above the still-live
  // board and chat instead of replacing them. 'abandoned' (a reset
  // session's old row — handleReset already navigated away to a fresh one)
  // stays a real dead end; there is nothing left here to continue.
  const completedBanner =
    session.status === 'completed' ? (
      <SessionSummaryCard
        summary={session.summary ?? ''}
        homework={session.homework}
        onBackToGames={() => navigate('/games')}
        onViewProgress={() => navigate('/progress')}
      />
    ) : null;

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
      autoplayIntervalMs={autoplayIntervalMs}
      onChangeAutoplayInterval={setAutoplayIntervalMs}
      sendMessage={(content) => void chat.sendMessage(content)}
      onArrowsChange={setBoardArrows}
      hoverMove={hoverMove}
      sessionMode={session.mode}
      sessionId={sessionId}
      onPlayMoveCommitted={handlePlayMoveCommitted}
      onUndoMove={session.mode === 'play' ? undoLastMove : undefined}
      undoDisabled={!canUndo}
      isExploring={isExploring}
      onOpenExplore={openExplore}
      onCloseExplore={boardState.backToCoach}
      exploreFeedback={exploreFeedback}
    />
  );

  const engineBadge = engineActivity.engineMode ? ENGINE_MODE_BADGE[engineActivity.engineMode] : 'Engine';
  const headerExtraItems: OverflowMenuItem[] = [
    ...(ttsEnabled
      ? [
          {
            label: coachVoice.autoplayEnabled ? 'Turn off coach voice' : 'Turn on coach voice',
            onSelect: () => coachVoice.setAutoplayEnabled(!coachVoice.autoplayEnabled)
          }
        ]
      : []),
    { label: `Engine: ${engineBadge}`, onSelect: () => navigate('/settings#settings-engine') },
    { label: 'Settings', onSelect: () => navigate('/settings') }
  ];

  const chatPanel = (
    <ChatPane
      messages={chat.messages}
      activeToolName={chat.activeToolName}
      isThinking={chat.isThinking}
      thinkingLabel={chat.thinkingLabel}
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
      {unlockModal.isOpen && (
        <UnlockPhraseModal
          description="Your coach needs your AI setup unlocked to continue this session."
          onClose={unlockModal.onClose}
          onUnlock={unlockModal.onUnlock}
          onUnlocked={unlockModal.onUnlocked}
          isPending={unlockModal.isPending}
          isSuccess={unlockModal.isSuccess}
          errorMessage={unlockModal.errorMessage}
        />
      )}
      {setupRequiredModal.isOpen && (
        <AiSetupRequiredModal
          onClose={setupRequiredModal.onClose}
          onGoToSettings={setupRequiredModal.onGoToSettings}
          onAnalyzeInstead={setupRequiredModal.onAnalyzeInstead}
        />
      )}
      <SessionHeader
        whiteName={gameQuery.data?.whiteName ?? null}
        blackName={gameQuery.data?.blackName ?? null}
        result={gameQuery.data?.result ?? null}
        onBack={() => navigate('/games')}
        onReset={handleReset}
        onDebug={() => setIsDebugOpen(true)}
        debugDisabled={!hasCompletedTurn}
        extraItems={headerExtraItems}
      />
      {isDebugOpen && <DebugPanel sessionId={sessionId} onClose={() => setIsDebugOpen(false)} />}
      {completedBanner}
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
      ) : (
        <MobileCoachSessionBody
          board={board}
          messagePaging={messagePaging}
          fen={fen}
          positions={positions}
          onSelectPly={peekAt}
          onHoverMove={setHoverMove}
          coachPersona={persona}
          displayName={profileQuery.data?.displayName}
          ttsEnabled={ttsEnabled}
          coachVoice={coachVoice}
          isThinking={chat.isThinking}
          thinkingLabel={chat.thinkingLabel}
          activeToolName={chat.activeToolName}
          onSend={handleSendMessage}
          boardArrows={boardArrows}
          hasPendingLine={Boolean(divergedLine.line)}
          isExploring={isExploring}
          exploreFeedback={exploreFeedback}
        />
      )}
    </div>
  );
}
