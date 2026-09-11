import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import { COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ArrowRef } from './arrowToken.js';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { CloseIcon, MessageCircleIcon, VolumeOffIcon, VolumeOnIcon } from '../../components/Icon.js';
import { ChipReplyInput } from './ChipReplyInput.js';
import { createEmptyDraft, isDraftEmpty, reconcileArrowChips, serializeDraft, type DraftPart } from './composerDraft.js';
import { MessageList, type HoverMove } from './MessageList.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import { ToolActivity } from './ToolActivity.js';
import './ChatPane.css';

const NO_ARROWS: ArrowRef[] = [];
const DEFAULT_COACH_PERSONA: CoachPersona = 'general';

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
  /** The selected coach persona — passed through to MessageList. */
  coachPersona?: CoachPersona;
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
  /** SessionPage passes true only below the side-by-side breakpoint: the
   * reply composer starts collapsed behind a button instead of an
   * always-open text row. The board now sits right above this panel on
   * mobile (no more separate Board/Coach tabs) — an always-summoned
   * keyboard would cover it whether the student wanted to type or not.
   * Desktop's side-by-side board+chat has room to spare, so it keeps the
   * classic always-open input (default false). */
  collapsibleComposer?: boolean;
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
  coachPersona = DEFAULT_COACH_PERSONA,
  autoplayEnabled,
  onToggleAutoplay,
  onPlayMessage,
  onStopMessage,
  playingMessageId,
  loadingMessageId,
  collapsibleComposer = false
}: ChatPaneProps): ReactNode {
  const [parts, setParts] = useState<DraftPart[]>(createEmptyDraft);
  const [isComposerOpen, setIsComposerOpen] = useState(!collapsibleComposer);
  const prevArrowsRef = useRef<ArrowRef[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // Only a user gesture (tapping the trigger button, or drawing a board
  // arrow while collapsed) should summon the keyboard — set right before the
  // state flip that reveals the input, and consumed by the focus effect
  // below so opening for any other reason (nothing else does today, but
  // the guard costs nothing) never steals focus unexpectedly.
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    // Captured once as a local, not re-read from the ref inside the setParts
    // updater below — updater functions run whenever React gets around to
    // processing the queued state change, which can be after the
    // `prevArrowsRef.current = boardArrows` line further down has already
    // mutated the ref, silently turning every arrow into a no-op diff.
    const previousArrows = prevArrowsRef.current;
    setParts((current) => reconcileArrowChips(current, previousArrows, boardArrows));
    prevArrowsRef.current = boardArrows;
    if (collapsibleComposer && !isComposerOpen && boardArrows.length > previousArrows.length) {
      shouldFocusRef.current = true;
      setIsComposerOpen(true);
    }
  }, [boardArrows, collapsibleComposer, isComposerOpen]);

  useEffect(() => {
    if (!isComposerOpen || !shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const inputs = formRef.current?.querySelectorAll('input');
    inputs?.[inputs.length - 1]?.focus();
  }, [isComposerOpen]);

  function openComposer(): void {
    shouldFocusRef.current = true;
    setIsComposerOpen(true);
  }

  // Blurring every input first is what actually dismisses the on-screen
  // keyboard — collapsing the composer alone wouldn't, since focus would
  // otherwise still sit on an element about to unmount.
  function closeComposer(): void {
    formRef.current?.querySelectorAll('input').forEach((input) => input.blur());
    setIsComposerOpen(false);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (isDraftEmpty(parts) && !hasPendingLine) return;
    onSend(serializeDraft(parts).trim());
    setParts(createEmptyDraft());
  }

  return (
    <div className="chat-pane">
      <div className="chat-pane__header">
        <a
          href="/settings"
          className="chat-pane__coach-identity"
          aria-label={`Change coach (currently ${COACH_PERSONA_INFO[coachPersona].label})`}
          title="Change coach"
        >
          <CoachAvatar persona={coachPersona} size="header" />
          <div className="chat-pane__coach-details">
            <strong className="chat-pane__coach-name">{COACH_PERSONA_INFO[coachPersona].label}</strong>
          </div>
        </a>
        {onToggleAutoplay && (
          <button
            type="button"
            className="chat-pane__voice-toggle"
            aria-label={autoplayEnabled ? 'Disable automatic coach voice' : 'Enable automatic coach voice'}
            aria-pressed={autoplayEnabled ?? false}
            title={autoplayEnabled ? 'Disable automatic coach voice' : 'Enable automatic coach voice'}
            onClick={() => onToggleAutoplay(!(autoplayEnabled ?? false))}
          >
            {autoplayEnabled ? <VolumeOnIcon width={25} height={25} /> : <VolumeOffIcon width={25} height={25} />}
          </button>
        )}
      </div>
      <MessageList
        messages={messages}
        onSelectPly={onSelectPly}
        fen={fen}
        positions={positions}
        onHoverMove={onHoverMove}
        coachPersona={coachPersona}
        onPlayMessage={onPlayMessage}
        onStopMessage={onStopMessage}
        playingMessageId={playingMessageId}
        loadingMessageId={loadingMessageId}
      />
      <ThinkingIndicator visible={isThinking} />
      <ToolActivity toolName={activeToolName} />
      {isComposerOpen ? (
        <form ref={formRef} onSubmit={handleSubmit}>
          <ChipReplyInput parts={parts} onChange={setParts} />
          <button type="submit" className="btn-primary">
            Send
          </button>
          {collapsibleComposer && (
            <button type="button" className="chat-pane__composer-close" onClick={closeComposer} aria-label="Close keyboard">
              <CloseIcon width={16} height={16} />
            </button>
          )}
        </form>
      ) : (
        <button type="button" className="chat-pane__composer-trigger" onClick={openComposer}>
          <MessageCircleIcon width={18} height={18} />
          Ask the coach a question
        </button>
      )}
    </div>
  );
}
