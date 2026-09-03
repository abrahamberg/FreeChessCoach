import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useIsBoardSideBySide } from '../../hooks/useIsBoardSideBySide.js';
import { CoachBoard } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { ChatPane } from '../chat/ChatPane.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import '../session/SessionPage.css';
import { usePuzzleSessionPageData } from './usePuzzleSessionPageData.js';
import './PuzzleSessionPage.css';

/**
 * docs/plan.md Phase 59, Task 59.6 — coach-guided walkthrough of one
 * puzzle_assignments batch. Mirrors session/SessionPage.tsx's board + chat
 * layout (same SessionPage.css layout classes, same CoachBoard/ChatPane/
 * DivergedLinePanel components — all already generic over a FEN) against
 * the puzzle-sessions endpoints instead of the game-review ones. NOT
 * reused: the move list/MoveExplorer, SessionPeekBar, position-divider
 * navigation, mobile tab-swipe body — none of that exists for a puzzle set
 * (see usePuzzleSessionPageData.ts and puzzle-session-tools.ts on the API
 * side for why show_position specifically has no equivalent here).
 */
export function PuzzleSessionPage(): ReactNode {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const isSideBySide = useIsBoardSideBySide();
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);

  const { createMutation, detailQuery, currentItem, divergedLine, annotations, chat } = usePuzzleSessionPageData(
    assignmentId ?? ''
  );

  if (createMutation.isError) return <p>Could not start this practice session.</p>;
  if (createMutation.isPending || createMutation.isIdle || detailQuery.isLoading) return <p>Loading…</p>;
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

  if (session.status === 'paused_no_credits') {
    return (
      <div className="session-paused-card">
        <p>The session is saved. Add credits or your own API key to continue.</p>
        <button type="button" onClick={() => navigate('/settings')}>
          Add credits
        </button>
      </div>
    );
  }

  if (!currentItem) return <p>Could not load the current puzzle.</p>;

  function handleSendMessage(content: string): void {
    if (divergedLine.line) {
      void chat.sendMessage(encodeDivergedLine(divergedLine.line, content));
      return;
    }
    void chat.sendMessage(content);
  }

  function handleUserMove(san: string, fen: string, uci: string): void {
    if (!currentItem) return;
    const real = { ply: session.currentItemIndex, fen: currentItem.fen };
    if (divergedLine.expectingMove) {
      divergedLine.consumeExpectingMove();
      const message = divergedLine.line
        ? encodeDivergedLine(divergedLine.appendMove({ san, fen, uci }, real), '')
        : `[board_move] I played ${san} (position now: ${fen})`;
      void chat.sendMessage(message);
      return;
    }
    divergedLine.appendMove({ san, fen, uci }, real);
  }

  const boardFen = divergedLine.fen ?? currentItem.fen;

  const board = (
    <div className="session-board-column">
      <CoachBoard
        fen={boardFen}
        orientation="white"
        mode="answer"
        arrows={annotations.arrows}
        highlights={annotations.highlights}
        onUserMove={handleUserMove}
      />
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
          Puzzle {session.currentItemIndex + 1} of {session.assignment.items.length}
        </span>
      </header>
      <div className={isSideBySide ? 'session-body desktop' : 'session-body'}>
        {isSideBySide && divergedLine.line && (
          <DivergedLinePanel
            line={divergedLine.line}
            stepIndex={divergedLine.stepIndex}
            onSelectStep={divergedLine.previewStep}
            onExit={divergedLine.exit}
            autoplayIntervalMs={autoplayIntervalMs}
            onChangeAutoplayInterval={setAutoplayIntervalMs}
          />
        )}
        {board}
        {chatPanel}
      </div>
    </div>
  );
}
