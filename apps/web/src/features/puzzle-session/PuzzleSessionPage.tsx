import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../../components/Modal.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu.js';
import { useConfirmDialog } from '../../hooks/useConfirmDialog.js';
import { useCoachVoice } from '../../hooks/useCoachVoice.js';
import { useLlmSetupStatus } from '../../hooks/useLlmSetupStatus.js';
import { effectiveTtsBackend } from '../../tts/effective-tts-backend.js';
import { isOpenAiVoiceAvailable } from '../../tts/openai-voice-available.js';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { CoachBoard } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { ChatPane } from '../chat/ChatPane.js';
import { DebugPanel } from '../chat/DebugPanel.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { UnlockPhraseModal } from '../settings/UnlockPhraseModal.js';
import '../session/SessionPage.css';
import { PuzzlePlanStrip } from './PuzzlePlanStrip.js';
import { usePuzzleSessionPageData } from './usePuzzleSessionPageData.js';
import './PuzzleSessionPage.css';

/**
 * docs/plan.md Phase 59, Task 59.6 — a coach-guided focused-practice
 * session on one puzzle_assignments batch. Discuss-only: the board is turned
 * to the student's side and locked; the coach sees the whole line and plays
 * each move on the board once the student has established it. Same three-column desktop
 * layout as session/SessionPage.tsx (move list | board | chat, same
 * SessionPage.css classes) and the same CoachBoard/ChatPane/
 * DivergedLinePanel/MoveExplorer components — this used to be a bespoke,
 * puzzle-solving-flavored page; it's now the same coached-session shape as
 * a real game, just against a known line instead of a played-out one (see
 * usePuzzleSessionPageData.ts for the move-attempt/peek mechanics).
 */
export function PuzzleSessionPage(): ReactNode {
  // Bumped by "Reset session" so the whole body remounts on the fresh session.
  const [generation, setGeneration] = useState(0);
  return <PuzzleSessionBody key={generation} onSessionReset={() => setGeneration((value) => value + 1)} />;
}

function PuzzleSessionBody({ onSessionReset }: { onSessionReset: () => void }): ReactNode {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const isSideBySide = useIsBoardSideBySide();
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);

  const {
    createQuery,
    detailQuery,
    profileQuery,
    currentItem,
    divergedLine,
    annotations,
    chat,
    boardFen,
    orientation,
    sanMoves,
    historyPositions,
    currentPly,
    viewedPly,
    selectHistoryPly,
    items,
    currentItemIndex,
    lineComplete,
    isAdvancingItem,
    advanceToNextItem,
    setupRequiredModal,
    unlockModal,
    resetSession,
    isResetting
  } = usePuzzleSessionPageData(assignmentId ?? '', onSessionReset);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  // Coach voice — same wiring as the coach game (SessionPage.tsx): the
  // persona picks the voice, and Settings' TTS switch/backend decide whether
  // and how the coach's replies are spoken.
  const persona = profileQuery.data?.coachPersona ?? 'general';
  const ttsEnabled = profileQuery.data?.ttsEnabled ?? false;
  const llmSetupQuery = useLlmSetupStatus();
  const savedTtsBackend = profileQuery.data?.ttsBackend ?? 'openai';
  const ttsBackend = effectiveTtsBackend(savedTtsBackend, isOpenAiVoiceAvailable(llmSetupQuery.data));
  const coachVoice = useCoachVoice({
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    persona,
    enabled: ttsEnabled,
    backend: ttsBackend
  });

  if (createQuery.isError) return <p>Could not start this practice session.</p>;
  if (createQuery.isPending || detailQuery.isLoading) return <p>Loading…</p>;
  if (detailQuery.isError || !detailQuery.data) return <p>Could not load this practice session.</p>;

  const session = detailQuery.data;

  if (session.status === 'completed') {
    const completedCount = session.assignment.items.filter((item) => item.result !== 'pending').length;
    return (
      <Modal title="You did it!" onClose={() => navigate('/progress')}>
        <div className="puzzle-session-complete">
          <p>You've finished the focus session your coach assigned you: {session.assignment.reason}</p>
          <p>
            {completedCount} of {session.assignment.items.length} practice positions complete.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate('/progress')}>
            Back to Progress
          </button>
        </div>
      </Modal>
    );
  }

  if (session.status === 'abandoned') {
    return (
      <div className="session-summary-card">
        <p>This practice session was ended.</p>
        <button type="button" onClick={() => navigate('/progress')}>
          Back to Progress
        </button>
      </div>
    );
  }

  if (!currentItem) return <p>Could not load the current item.</p>;

  function handleSendMessage(content: string): void {
    if (divergedLine.line) {
      void chat.sendMessage(encodeDivergedLine(divergedLine.line, content));
      return;
    }
    void chat.sendMessage(content);
  }

  const hasCompletedTurn = chat.messages.some((message) => message.role === 'assistant' && message.text !== '');
  const menuItems: OverflowMenuItem[] = [
    ...(ttsEnabled
      ? [
          {
            label: coachVoice.autoplayEnabled ? 'Turn off coach voice' : 'Turn on coach voice',
            onSelect: () => coachVoice.setAutoplayEnabled(!coachVoice.autoplayEnabled)
          }
        ]
      : []),
    {
      label: 'Reset session',
      destructive: true,
      disabled: isResetting,
      onSelect: () => {
        confirm(
          {
            title: 'Reset this session?',
            description: 'This ends the current conversation and starts a fresh one on this position.',
            confirmLabel: 'Reset session'
          },
          resetSession
        );
      }
    },
    {
      label: 'Debug last answer',
      onSelect: () => setIsDebugOpen(true),
      disabled: !hasCompletedTurn
    }
  ];

  const board = (
    <div className="session-board-column">
      <div className="session-board-row">
        <CoachBoard
          fen={boardFen}
          orientation={orientation}
          mode="peek"
          arrows={annotations.arrows}
          highlights={annotations.highlights}
          disabled
        />
      </div>
      <p className="puzzle-session-page__locked" role="note">
        Discuss only — you can't move the pieces here. Tell your coach what you'd play; they'll move the board for you.
      </p>
    </div>
  );

  const chatPanel = (
    <ChatPane
      messages={chat.messages}
      activeToolName={chat.activeToolName}
      isThinking={chat.isThinking}
      onSend={handleSendMessage}
      hasPendingLine={Boolean(divergedLine.line)}
      fen={boardFen}
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
    <div className="session-page puzzle-session-page">
      {confirmDialog}
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
        <AiSetupRequiredModal onClose={setupRequiredModal.onClose} onGoToSettings={setupRequiredModal.onGoToSettings} />
      )}
      <header className="puzzle-session-page__header">
        <button type="button" onClick={() => navigate('/progress')}>
          ← Progress
        </button>
        <span className="puzzle-session-page__actions">
          <span className="puzzle-session-page__progress">
            Practice {session.currentItemIndex + 1} of {session.assignment.items.length}
          </span>
          <OverflowMenu label="Session options" items={menuItems} />
        </span>
      </header>
      {isDebugOpen && <DebugPanel sessionId={session.id} basePath="/api/puzzle-sessions" onClose={() => setIsDebugOpen(false)} />}
      <PuzzlePlanStrip
        items={items}
        currentItemIndex={currentItemIndex}
        lineComplete={lineComplete}
        isAdvancing={isAdvancingItem}
        onAdvance={advanceToNextItem}
      />
      <div className={isSideBySide ? 'session-body desktop' : 'session-body'}>
        {isSideBySide &&
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
                classifiedMoves={[]}
                positions={historyPositions}
                currentPly={viewedPly ?? currentPly}
                onSelect={selectHistoryPly}
                showNotes={false}
              />
            </div>
          ))}
        {board}
        {chatPanel}
      </div>
    </div>
  );
}
