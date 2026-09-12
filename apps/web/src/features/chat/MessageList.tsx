import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { renderMessageItem, visibleMessages, type HoverMove, type MessageRenderContext } from './renderMessageItem.js';

// Re-exported so existing importers (PagedMessageCard, useMessagePaging,
// ChatPane, SessionPage, SessionBoardColumn) keep resolving these from
// './MessageList.js' — only renderMessageItem.tsx's own internals moved.
export { renderMessageItem, visibleMessages };
export type { HoverMove, MessageRenderContext };

export interface MessageListProps {
  messages: CoachMessage[];
  /** Clicking a PositionDivider jumps the board to that ply (peek mode). */
  onSelectPly?: (ply: number) => void;
  /** The position currently on the board — resolves bare (no move-number)
   * SAN move mentions in coach text against it, and is the fallback when a
   * numbered mention's ply isn't found in `positions`. Defaults to ''
   * (nothing resolves, mentions render as plain/bold text). */
  fen?: string;
  /** Every ply's FEN for the game being reviewed — lets a numbered mention
   * like "3.Bc4" resolve against the position it actually names instead of
   * whatever is currently on the board (design.md §5.3). Defaults to []. */
  positions?: ParsedPosition[];
  /** Fired on hover/focus of a resolved move mention, and with null on
   * hover/blur-out — lifted by the parent to draw a preview arrow+highlight
   * on the board, in a color distinct from the coach's own annotate_board
   * arrows (design.md §5.3). */
  onHoverMove?: (move: HoverMove) => void;
  /** The selected coach persona. Defaults to the original coach. */
  coachPersona?: CoachPersona;
  /** Coach voice (TTS, OpenAI or browser — Settings): plays/replays one message's audio. Omitting
   * this prop hides the play button entirely — the feature is fully
   * optional for callers that don't wire up useCoachVoice. */
  onPlayMessage?: (messageId: string, text: string) => void;
  /** Stops whatever is currently playing/loading (useCoachVoice's stop()).
   * The per-message button calls this instead of onPlayMessage while that
   * message is the one playing or loading — already-synthesized audio stays
   * cached, so a later play click on the same message replays instantly
   * rather than re-fetching (and, on the OpenAI backend, re-spending
   * credits). */
  onStopMessage?: () => void;
  /** The message id currently playing, if any. */
  playingMessageId?: string | null;
  /** The message id currently being synthesized (first play, cache miss), if any. */
  loadingMessageId?: string | null;
}

const NO_POSITIONS: ParsedPosition[] = [];
const AT_BOTTOM_THRESHOLD_PX = 24;
const DEFAULT_COACH_PERSONA: CoachPersona = 'general';

/** design.md §5.3: auto-scroll only if the user is already at the bottom —
 * never yank them while reading history. Desktop's own transcript view;
 * SessionPage's mobile layout uses PagedMessageCard instead (one message at
 * a time, paged left/right — see that component's own doc comment), sharing
 * renderMessageItem.tsx's renderMessageItem/visibleMessages rather than
 * duplicating the per-message-type rendering. */
export function MessageList({
  messages,
  onSelectPly,
  fen = '',
  positions = NO_POSITIONS,
  onHoverMove,
  coachPersona = DEFAULT_COACH_PERSONA,
  onPlayMessage,
  onStopMessage,
  playingMessageId = null,
  loadingMessageId = null
}: MessageListProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  function handleScroll(): void {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD_PX;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [messages]);

  const context: MessageRenderContext = {
    fen,
    positions,
    onSelectPly,
    onHoverMove,
    coachPersona,
    onPlayMessage,
    onStopMessage,
    playingMessageId,
    loadingMessageId
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} data-testid="message-list" aria-live="polite">
      {visibleMessages(messages).map((message, index, visible) => renderMessageItem(message, index, visible, context))}
    </div>
  );
}
