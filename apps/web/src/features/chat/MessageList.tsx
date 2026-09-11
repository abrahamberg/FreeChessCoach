import { moveRefToPly, resolveSanMove, type ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { PauseIcon, PlaySmallIcon } from '../../components/Icon.js';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { AnnotationNote } from './AnnotationNote.js';
import { ArrowToken } from './ArrowToken.js';
import { splitArrowTokens } from './arrowToken.js';
import { DivergedLineMessage } from './DivergedLineMessage.js';
import { DivergedLineStart } from './DivergedLineStart.js';
import { decodeDivergedLine, decodeDivergedLineStart } from './divergedLine.js';
import { MoveCard } from './MoveCard.js';
import { parseMessageSegments, type MessageSegment } from './moveMention.js';
import { MoveMention } from './MoveMention.js';
import { PositionContextMessage } from './PositionContextMessage.js';
import { decodeAnnotationNote, decodePositionContext, decodePositionDivider } from './positionDivider.js';
import { PositionDivider } from './PositionDivider.js';
import { BOARD_MOVE_PATTERN, PLAYER_MOVE_PATTERN } from './sentinels.js';
import { getSpeakableText } from '../../tts/getSpeakableText.js';

export type HoverMove = { from: string; to: string } | null;

/** A move mention like "3.Bc4" names a position from earlier (or later) in
 * the game than whatever is currently on the board — resolving it against
 * the live position would silently fail (wrong piece placement) or, worse,
 * resolve to the wrong squares. When the mention carries a move number, look
 * up the FEN right before that ply was played instead; bare mentions with no
 * number (e.g. "b3") have no ply to anchor to, so fall back to the live
 * position, which is the best available guess. */
function fenForSegment(
  segment: Extract<MessageSegment, { type: 'move' }>,
  positions: ParsedPosition[],
  currentFen: string
): string {
  if (segment.moveNumber === undefined || segment.color === undefined) return currentFen;
  const ply = moveRefToPly(segment.moveNumber, segment.color);
  const beforeMove = positions.find((position) => position.ply === ply - 1);
  return beforeMove?.fen ?? currentFen;
}

/** design.md §5.3/§5.7: renders a plain message's text with any inline
 * `[e2-e4]`-style arrow references shown as badges (not raw brackets),
 * `**bold**` spans as real emphasis (not literal asterisks), and any SAN
 * move mention resolvable against the position it names as a hoverable
 * board reference. */
function renderMessageText(
  text: string,
  currentFen: string,
  positions: ParsedPosition[],
  onHoverMove?: (move: HoverMove) => void
): ReactNode {
  return splitArrowTokens(text).map((segment, index) =>
    segment.type === 'text' ? (
      <Fragment key={index}>{renderTextSegment(segment.value, currentFen, positions, onHoverMove, index)}</Fragment>
    ) : (
      <ArrowToken key={index} from={segment.from} to={segment.to} />
    )
  );
}

function renderTextSegment(
  text: string,
  currentFen: string,
  positions: ParsedPosition[],
  onHoverMove: ((move: HoverMove) => void) | undefined,
  keyPrefix: number
): ReactNode {
  return parseMessageSegments(text).map((segment, index) => {
    const key = `${keyPrefix}-${index}`;
    if (segment.type === 'text') {
      return segment.bold ? <strong key={key}>{segment.value}</strong> : <Fragment key={key}>{segment.value}</Fragment>;
    }
    const resolved = resolveSanMove(fenForSegment(segment, positions, currentFen), segment.san);
    if (!resolved) return segment.bold ? <strong key={key}>{segment.text}</strong> : <Fragment key={key}>{segment.text}</Fragment>;
    return (
      <MoveMention key={key} text={segment.text} bold={segment.bold} from={resolved.from} to={resolved.to} onHover={onHoverMove} />
    );
  });
}

export interface MessageRenderContext {
  fen: string;
  positions: ParsedPosition[];
  onSelectPly?: (ply: number) => void;
  onHoverMove?: (move: HoverMove) => void;
  coachPersona: CoachPersona;
  onPlayMessage?: (messageId: string, text: string) => void;
  onStopMessage?: () => void;
  playingMessageId: string | null;
  loadingMessageId: string | null;
  /** SessionPage's mobile PagedMessageCard shows one message at a time, so
   * "starts a coach run" (the default: only the first of consecutive
   * assistant messages gets an avatar) has no adjacent message to compare
   * against — every assistant message gets its own avatar there instead. */
  alwaysShowAvatar?: boolean;
}

/** Renders one transcript entry — a move card, position divider, annotation,
 * diverged-line message, or plain text with resolved move mentions/arrow
 * tokens and the optional voice-playback button. Extracted so both
 * MessageList (the desktop transcript, every message stacked and scrolling)
 * and PagedMessageCard (mobile: one message at a time) share the exact same
 * per-message-type rendering instead of two copies drifting apart. */
export function renderMessageItem(message: CoachMessage, index: number, visible: CoachMessage[], ctx: MessageRenderContext): ReactNode {
  const boardMove = message.text.match(BOARD_MOVE_PATTERN);
  if (boardMove) {
    const [, san, fen] = boardMove;
    return <MoveCard key={message.id} san={san ?? ''} fen={fen ?? ''} />;
  }
  const playerMove = message.text.match(PLAYER_MOVE_PATTERN);
  if (playerMove) {
    const [, san] = playerMove;
    return <MoveCard key={message.id} san={san ?? ''} fen="" />;
  }
  const divider = decodePositionDivider(message.text);
  if (divider) {
    return <PositionDivider key={message.id} ply={divider.ply} san={divider.san} onSelect={ctx.onSelectPly} />;
  }
  const annotation = decodeAnnotationNote(message.text);
  if (annotation) {
    return <AnnotationNote key={message.id} arrows={annotation.arrows} highlights={annotation.highlights} />;
  }
  const context = decodePositionContext(message.text);
  if (context) {
    return (
      <PositionContextMessage
        key={message.id}
        moveNumber={context.moveNumber}
        color={context.color}
        san={context.san}
        content={context.content}
      />
    );
  }
  const divergedLineStart = decodeDivergedLineStart(message.text);
  if (divergedLineStart) {
    return <DivergedLineStart key={message.id} basePly={divergedLineStart.basePly} sanMoves={divergedLineStart.sanMoves} />;
  }
  const divergedLine = decodeDivergedLine(message.text);
  if (divergedLine) {
    return <DivergedLineMessage key={message.id} basePly={divergedLine.basePly} sanText={divergedLine.sanText} content={divergedLine.content} />;
  }
  // design.md §5.3: one small avatar at the start of each coach run, not on
  // every message — only when the previous visible message wasn't also from
  // the assistant. (ctx.alwaysShowAvatar skips that adjacency check — see
  // its own doc comment.)
  const startsCoachRun = message.role === 'assistant' && (ctx.alwaysShowAvatar || visible[index - 1]?.role !== 'assistant');
  const speakableText = ctx.onPlayMessage ? getSpeakableText(message) : null;
  const voiceState = ctx.loadingMessageId === message.id ? 'loading' : ctx.playingMessageId === message.id ? 'playing' : 'idle';
  return (
    <p key={message.id} data-role={message.role}>
      {startsCoachRun && <CoachAvatar persona={ctx.coachPersona} />}
      {renderMessageText(message.text, ctx.fen, ctx.positions, ctx.onHoverMove)}
      {speakableText && (
        <button
          type="button"
          className="coach-voice-button"
          data-state={voiceState}
          aria-label={voiceState === 'idle' ? 'Play coach message' : 'Stop coach message'}
          onClick={() => (voiceState === 'idle' ? ctx.onPlayMessage?.(message.id, speakableText) : ctx.onStopMessage?.())}
        >
          {voiceState === 'loading' ? (
            <span className="coach-voice-button__spinner" aria-hidden="true" />
          ) : voiceState === 'playing' ? (
            <PauseIcon width={11} height={11} />
          ) : (
            <PlaySmallIcon width={11} height={11} />
          )}
        </button>
      )}
    </p>
  );
}

/** The visible (non-empty) transcript, in the order every caller needs it —
 * PagedMessageCard/useMessagePaging index into this same filtered array so
 * "message 3 of 8" always agrees with what MessageList itself would show. */
export function visibleMessages(messages: CoachMessage[]): CoachMessage[] {
  return messages.filter((message) => message.text.trim() !== '');
}

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
 * this file's renderMessageItem/visibleMessages rather than duplicating the
 * per-message-type rendering. */
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

  const ctx: MessageRenderContext = {
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
      {visibleMessages(messages).map((message, index, visible) => renderMessageItem(message, index, visible, ctx))}
    </div>
  );
}
