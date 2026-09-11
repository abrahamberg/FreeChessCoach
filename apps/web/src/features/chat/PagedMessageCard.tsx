import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { renderMessageItem, type HoverMove, type MessageRenderContext } from './MessageList.js';
import './PagedMessageCard.css';

export interface PagedMessageCardProps {
  message: CoachMessage | undefined;
  index: number;
  visible: CoachMessage[];
  fen?: string;
  positions?: ParsedPosition[];
  onSelectPly?: (ply: number) => void;
  onHoverMove?: (move: HoverMove) => void;
  coachPersona: CoachPersona;
  onPlayMessage?: (messageId: string, text: string) => void;
  onStopMessage?: () => void;
  playingMessageId?: string | null;
  loadingMessageId?: string | null;
}

/** SessionPage's mobile layout shows one transcript entry at a time — the
 * exact same "one card, scrollable in its own box" structure GameReviewPage
 * landed on for its note card, applied to chat messages instead of move
 * notes (MessageNavPills is the equivalent of that page's MoveNavPills,
 * paging left/right between entries; the board sits between the two, same
 * as it sits between GameReviewPage's note card and its nav pills). Content
 * rendering is shared with the desktop transcript via
 * MessageList.renderMessageItem — only the container (one card instead of a
 * scrolling stack of every message) differs. */
export function PagedMessageCard({
  message,
  index,
  visible,
  fen = '',
  positions = [],
  onSelectPly,
  onHoverMove,
  coachPersona,
  onPlayMessage,
  onStopMessage,
  playingMessageId = null,
  loadingMessageId = null
}: PagedMessageCardProps): ReactNode {
  if (!message) {
    return (
      <div className="paged-message-card">
        <p className="paged-message-card__empty-text">No messages yet.</p>
      </div>
    );
  }

  const ctx: MessageRenderContext = {
    fen,
    positions,
    onSelectPly,
    onHoverMove,
    coachPersona,
    onPlayMessage,
    onStopMessage,
    playingMessageId,
    loadingMessageId,
    // Only this one message shows at a time — there's no adjacent message to
    // infer "starts a coach run" from, so every assistant message gets its
    // own avatar here (MessageList's own doc comment on alwaysShowAvatar).
    alwaysShowAvatar: true
  };

  return (
    <div className={message.role === 'user' ? 'paged-message-card paged-message-card--user' : 'paged-message-card'}>
      <div className="paged-message-card__body">{renderMessageItem(message, index, visible, ctx)}</div>
    </div>
  );
}
