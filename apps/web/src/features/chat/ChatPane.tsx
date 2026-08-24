import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ArrowRef } from './arrowToken.js';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { ChipReplyInput } from './ChipReplyInput.js';
import { createEmptyDraft, isDraftEmpty, reconcileArrowChips, serializeDraft, type DraftPart } from './composerDraft.js';
import { MessageList, type HoverMove } from './MessageList.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import { ToolActivity } from './ToolActivity.js';
import './ChatPane.css';

const NO_ARROWS: ArrowRef[] = [];

export interface ChatPaneProps {
  messages: CoachMessage[];
  activeToolName: string | null;
  /** design.md §5.7: shows the delayed 3-dot typing indicator. */
  isThinking?: boolean;
  onSend: (content: string) => void;
  /** Clicking a PositionDivider jumps the board to that ply (peek mode). */
  onSelectPly?: (ply: number) => void;
  /** design.md §5.7: the student's own right-click-drawn arrows, synced into
   * the reply box as chips — CoachBoard's onArrowsChange, lifted by the
   * parent (SessionPage). */
  boardArrows?: ArrowRef[];
  /** True while a diverged line is pending — Send should be
   * allowed even with an empty text draft, since the line itself (bundled
   * in by the parent's onSend) is the content being submitted. */
  hasPendingLine?: boolean;
  /** The position currently on the board — passed through to MessageList so
   * it can resolve SAN move mentions in coach text (design.md §5.3). */
  fen?: string;
  /** Every ply's FEN for the game being reviewed — passed through to
   * MessageList so a numbered move mention resolves against the position it
   * names, not whatever is currently on the board (design.md §5.3). */
  positions?: ParsedPosition[];
  /** Fired on hover/focus of a resolved move mention; lifted by the parent
   * to preview it on the board. */
  onHoverMove?: (move: HoverMove) => void;
  /** The selected coach persona's avatar glyph (coaches.md) — passed
   * through to MessageList. Defaults to the original coach's ♞ glyph. */
  coachAvatar?: string;
  /** Coach voice (TTS, OpenAI or browser — Settings): whether a finished
   * turn's audio plays automatically. Omit both this and onToggleAutoplay to
   * hide the toggle (SessionPage does this whenever the account's TTS master
   * switch is off); onPlayMessage gates the per-message play buttons the
   * same way. */
  autoplayEnabled?: boolean;
  onToggleAutoplay?: (enabled: boolean) => void;
  /** Passed straight through to MessageList — see its own doc comments. */
  onPlayMessage?: (messageId: string, text: string) => void;
  onStopMessage?: () => void;
  playingMessageId?: string | null;
  loadingMessageId?: string | null;
}

/** Composes MessageList + ToolActivity + the reply input. No fetching — the
 * parent (SessionPage) owns useCoachChat. The "Debug last answer" trigger
 * now lives in SessionHeader's overflow menu (SessionPage owns that state
 * and DebugPanel), not here. */
export function ChatPane({
  messages,
  activeToolName,
  isThinking = false,
  onSend,
  onSelectPly,
  boardArrows = NO_ARROWS,
  hasPendingLine = false,
  fen,
  positions,
  onHoverMove,
  coachAvatar,
  autoplayEnabled,
  onToggleAutoplay,
  onPlayMessage,
  onStopMessage,
  playingMessageId,
  loadingMessageId
}: ChatPaneProps): ReactNode {
  const [parts, setParts] = useState<DraftPart[]>(createEmptyDraft);
  const prevArrowsRef = useRef<ArrowRef[]>([]);

  useEffect(() => {
    setParts((current) => reconcileArrowChips(current, prevArrowsRef.current, boardArrows));
    prevArrowsRef.current = boardArrows;
  }, [boardArrows]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (isDraftEmpty(parts) && !hasPendingLine) return;
    onSend(serializeDraft(parts).trim());
    setParts(createEmptyDraft());
  }

  return (
    <div className="chat-pane">
      {onToggleAutoplay && (
        <div className="chat-pane__header">
          <label className="chat-pane__autoplay-toggle">
            <span>Autoplay coach voice</span>
            <input
              type="checkbox"
              className="toggle-switch"
              checked={autoplayEnabled ?? false}
              onChange={(event) => onToggleAutoplay(event.target.checked)}
            />
          </label>
        </div>
      )}
      <MessageList
        messages={messages}
        onSelectPly={onSelectPly}
        fen={fen}
        positions={positions}
        onHoverMove={onHoverMove}
        coachAvatar={coachAvatar}
        onPlayMessage={onPlayMessage}
        onStopMessage={onStopMessage}
        playingMessageId={playingMessageId}
        loadingMessageId={loadingMessageId}
      />
      <ThinkingIndicator visible={isThinking} />
      <ToolActivity toolName={activeToolName} />
      <form onSubmit={handleSubmit}>
        <ChipReplyInput parts={parts} onChange={setParts} />
        <button type="submit" className="btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
