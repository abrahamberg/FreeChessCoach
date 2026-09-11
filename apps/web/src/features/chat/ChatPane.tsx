import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import { COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import type { ArrowRef } from './arrowToken.js';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { VolumeOffIcon, VolumeOnIcon } from '../../components/Icon.js';
import { ChatComposer } from './ChatComposer.js';
import { MessageList, type HoverMove } from './MessageList.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import { ToolActivity } from './ToolActivity.js';
import './ChatPane.css';

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
}

/** The desktop side-by-side chat column: MessageList (the full, vertically
 * scrolling transcript) + ToolActivity + an always-open ChatComposer. No
 * fetching — the parent (SessionPage) owns useCoachChat. The "Debug last
 * answer" trigger now lives in SessionHeader's overflow menu (SessionPage
 * owns that state and DebugPanel), not here.
 *
 * Mobile has its own, differently-structured layout (SessionPage's
 * `.stacked` branch: one message at a time, paged left/right, the board
 * between the card and its nav pills, ChatComposer pinned to the screen's
 * bottom edge) — the exact same structure GameReviewPage's mobile layout
 * uses for its note card, not a vertically scrolling transcript. It
 * composes ChatHeader/PagedMessageCard/MessageNavPills/ChatComposer
 * directly rather than rendering this component. */
export function ChatPane({
  messages,
  activeToolName,
  isThinking = false,
  onSend,
  onSelectPly,
  boardArrows,
  hasPendingLine,
  fen,
  positions,
  onHoverMove,
  coachPersona = DEFAULT_COACH_PERSONA,
  autoplayEnabled,
  onToggleAutoplay,
  onPlayMessage,
  onStopMessage,
  playingMessageId,
  loadingMessageId
}: ChatPaneProps): ReactNode {
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
      <ChatComposer onSend={onSend} boardArrows={boardArrows} hasPendingLine={hasPendingLine} />
    </div>
  );
}
