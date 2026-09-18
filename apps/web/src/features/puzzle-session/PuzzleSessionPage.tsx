import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeftIcon, UndoIcon } from '../../components/Icon.js';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { CoachBoard } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { ChatPane } from '../chat/ChatPane.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import '../session/SessionPage.css';
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
    isMoveSubmitting,
    moveAttemptError,
    handleUserMove,
    handleLocalMove,
    sanMoves,
    historyPositions,
    currentPly,
    viewedPly,
    selectHistoryPly
  } = usePuzzleSessionPageData(assignmentId ?? '');

  if (createQuery.isError) return <p>Could not start this practice session.</p>;
  if (createQuery.isPending || detailQuery.isLoading) return <p>Loading…</p>;
  if (detailQuery.isError || !detailQuery.data) return <p>Could not load this practice session.</p>;

  const session = detailQuery.data;

  if (session.status === 'completed') {
    return (
      <div className="session-summary-card">
        <p>Nice work — you've finished this practice set.</p>
        <button type="button" onClick={() => navigate('/dashboard')}>
          Back to Progress
        </button>
      </div>
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
          arrows={annotations.arrows}
          highlights={annotations.highlights}
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
      {!divergedLine.line && (
        <p className="peek-pill">
          {boardMode === 'peek' ? (
            <>
              exploring —{' '}
              <button type="button" onClick={exitPeek}>
                <ChevronLeftIcon width={13} height={13} />
                back to coach
              </button>
            </>
          ) : (
            <button type="button" onClick={enterPeek}>
              explore on your own
            </button>
          )}
        </p>
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
      <header className="puzzle-session-page__header">
        <button type="button" onClick={() => navigate('/dashboard')}>
          ← Progress
        </button>
        <span className="puzzle-session-page__progress">
          Item {session.currentItemIndex + 1} of {session.assignment.items.length}
        </span>
      </header>
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
