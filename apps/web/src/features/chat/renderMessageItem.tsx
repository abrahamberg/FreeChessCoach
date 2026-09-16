import { moveRefToPly, resolveSanMove, type ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import { Fragment, type ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { PauseIcon, PlaySmallIcon } from '../../components/Icon.js';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { getSpeakableText } from '../../tts/getSpeakableText.js';
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
  /** Suppresses the built-in inline coach avatar (the assistant-text branch
   * below). PagedMessageCard sets this — it renders its own avatar
   * (CoachAvatar or UserAvatar) externally instead, positioned left/right
   * by role rather than inline before the text, so a message's side is
   * clear even with only one message on screen and no adjacent one to
   * compare against for "starts a coach run". */
  avatarHidden?: boolean;
}

/** Renders one transcript entry — a move card, position divider, annotation,
 * diverged-line message, or plain text with resolved move mentions/arrow
 * tokens and the optional voice-playback button. Extracted so both
 * MessageList (the desktop transcript, every message stacked and scrolling)
 * and PagedMessageCard (mobile: one message at a time) share the exact same
 * per-message-type rendering instead of two copies drifting apart. */
export function renderMessageItem(
  message: CoachMessage,
  index: number,
  visible: CoachMessage[],
  context: MessageRenderContext
): ReactNode {
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
    return <PositionDivider key={message.id} ply={divider.ply} san={divider.san} onSelect={context.onSelectPly} />;
  }
  const annotation = decodeAnnotationNote(message.text);
  if (annotation) {
    return <AnnotationNote key={message.id} arrows={annotation.arrows} highlights={annotation.highlights} />;
  }
  const positionContext = decodePositionContext(message.text);
  if (positionContext) {
    return (
      <PositionContextMessage
        key={message.id}
        moveNumber={positionContext.moveNumber}
        color={positionContext.color}
        san={positionContext.san}
        content={positionContext.content}
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
  // the assistant. (context.avatarHidden drops this entirely — see its own
  // doc comment.)
  const startsCoachRun = !context.avatarHidden && message.role === 'assistant' && visible[index - 1]?.role !== 'assistant';
  const speakableText = context.onPlayMessage ? getSpeakableText(message) : null;
  const voiceState = context.loadingMessageId === message.id ? 'loading' : context.playingMessageId === message.id ? 'playing' : 'idle';
  return (
    <p key={message.id} data-role={message.role}>
      {startsCoachRun && <CoachAvatar persona={context.coachPersona} />}
      {renderMessageText(message.text, context.fen, context.positions, context.onHoverMove)}
      {speakableText && (
        <button
          type="button"
          className="coach-voice-button"
          data-state={voiceState}
          aria-label={voiceState === 'idle' ? 'Play coach message' : 'Stop coach message'}
          onClick={() => (voiceState === 'idle' ? context.onPlayMessage?.(message.id, speakableText) : context.onStopMessage?.())}
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
