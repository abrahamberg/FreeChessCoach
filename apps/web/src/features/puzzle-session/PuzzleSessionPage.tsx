import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../../components/Modal.js';
import { UndoIcon } from '../../components/Icon.js';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { BoardActionBar } from '../board/BoardActionBar.js';
import { CoachBoard } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { useExploreFeedback } from '../board/useExploreFeedback.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { ChatPane } from '../chat/ChatPane.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { UnlockPhraseModal } from '../settings/UnlockPhraseModal.js';
import '../session/SessionPage.css';
import { PuzzlePlanStrip } from './PuzzlePlanStrip.js';
import { usePuzzleSessionPageData } from './usePuzzleSessionPageData.js';
import './PuzzleSessionPage.css';

/**
 * docs/plan.md Phase 59, Task 59.6 — a coach-guided focused-practice
 * session on one puzzle_assignments batch. Same three-column desktop
 * layout as session/SessionPage.tsx (move list | board | chat, same
 * SessionPage.css classes) and the same CoachBoard/ChatPane/
 * DivergedLinePanel/MoveExplorer components — this used to be a bespoke,
 * puzzle-solving-flavored page; it's now the same coached-session shape as
 * a real game, just against a known line instead of a played-out one (see
 * usePuzzleSessionPageData.ts for the move-attempt/peek mechanics).
 */
export function PuzzleSessionPage(): ReactNode {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const isSideBySide = useIsBoardSideBySide();
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);

  const {
    createQuery,
    detailQuery,
    currentItem,
    divergedLine,
    annotations,
    chat,
    boardFen,
    boardMode,
    enterPeek,
    exitPeek,
    hint,
    isMoveSubmitting,
    moveAttemptError,
    handleUserMove,
    handleLocalMove,
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
    unlockModal
  } = usePuzzleSessionPageData(assignmentId ?? '');

  // "Explore on your own" (BoardActionBar's eye toggle) — same ownership
  // split SessionPage.tsx uses: isExploring lives here, not inside the data
  // hook, since it's pure UI state with no bearing on what gets persisted.
  const [isExploring, setIsExploring] = useState(false);
  useEffect(() => {
    if (boardMode !== 'peek') setIsExploring(false);
  }, [boardMode]);
  // No lastMove (null) — puzzle practice has nowhere to show the per-move
  // coach-box note ExploreNoteCard gives analyze/play/play_bot, so this only
  // drives the pill's own live eval word, not a move classification.
  const exploreFeedback = useExploreFeedback({ enabled: isExploring, fen: boardFen, lastMove: null });
  function openExplore(): void {
    setIsExploring(true);
    enterPeek();
  }
  function closeExplore(): void {
    setIsExploring(false);
    exitPeek();
  }

  if (createQuery.isError) return <p>Could not start this practice session.</p>;
  if (createQuery.isPending || detailQuery.isLoading) return <p>Loading…</p>;
  if (detailQuery.isError || !detailQuery.data) return <p>Could not load this practice session.</p>;

  const session = detailQuery.data;

  if (session.status === 'completed') {
    const completedCount = session.assignment.items.filter((item) => item.result !== 'pending').length;
    return (
      <Modal title="You did it!" onClose={() => navigate('/dashboard')}>
        <div className="puzzle-session-complete">
          <p>You've finished the focus session your coach assigned you: {session.assignment.reason}</p>
          <p>
            {completedCount} of {session.assignment.items.length} puzzles complete.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate('/dashboard')}>
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
        <button type="button" onClick={() => navigate('/dashboard')}>
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

  const board = (
    <div className="session-board-column">
      <div className="session-board-row">
        <CoachBoard
          fen={boardFen}
          orientation="white"
          mode={boardMode}
          isExploring={isExploring}
          arrows={[...annotations.arrows, ...hint.arrows, ...exploreFeedback.arrows]}
          highlights={[...annotations.highlights, ...hint.highlights, ...exploreFeedback.highlights]}
          onUserMove={handleUserMove}
          onLocalMove={handleLocalMove}
          disabled={isMoveSubmitting}
        />
      </div>
      {moveAttemptError && (
        <p className="play-move-error" role="alert">
          {moveAttemptError}
        </p>
      )}
      {/* Same BoardActionBar every live-position board gets (see its own doc
          comment) — no Undo here: an accepted real attempt just advances,
          and a rejected one reverts on its own, so there's nothing to
          self-serve undo the way play/play_bot's own last committed move. */}
      {!divergedLine.line && (
        <BoardActionBar
          isExploring={isExploring}
          onOpenExplore={openExplore}
          onCloseExplore={closeExplore}
          exploreStatus={exploreFeedback.status}
          exploreEvaluation={exploreFeedback.evaluation}
          hint={hint}
        />
      )}
      {divergedLine.line && (
        <p className="undo-pill">
          <button type="button" onClick={divergedLine.undoLastMove}>
            <UndoIcon width={13} height={13} />
            undo last move
          </button>
        </p>
      )}
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
    />
  );

  return (
    <div className="session-page puzzle-session-page">
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
        <button type="button" onClick={() => navigate('/dashboard')}>
          ← Progress
        </button>
        <span className="puzzle-session-page__progress">
          Item {session.currentItemIndex + 1} of {session.assignment.items.length}
        </span>
      </header>
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
