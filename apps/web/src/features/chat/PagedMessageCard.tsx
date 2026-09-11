import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { UserAvatar } from '../../components/UserAvatar.js';
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
  /** The signed-in student's own display name — UserAvatar's initials, so
   * their own messages read as unmistakably theirs even with only one
   * message on screen at a time. */
  displayName?: string;
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
 * scrolling stack of every message, plus which side the avatar sits on)
 * differs. The coach's portrait sits to the left of the card, the
 * student's own initials to the right (UserAvatar) — whose turn it was is
 * never ambiguous even with no neighboring message to compare against. */
export function PagedMessageCard({
  message,
  index,
  visible,
  fen = '',
  positions = [],
  onSelectPly,
  onHoverMove,
  coachPersona,
  displayName,
  onPlayMessage,
  onStopMessage,
  playingMessageId = null,
  loadingMessageId = null
}: PagedMessageCardProps): ReactNode {
  if (!message) {
    return (
      <div className="paged-message-card-row">
        <CoachAvatar persona={coachPersona} size="chat" />
        <div className="paged-message-card">
          <p className="paged-message-card__empty-text">No messages yet.</p>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';
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
    // Both avatars render externally below, positioned by role — the
    // built-in inline one (MessageList's own "starts a coach run" rule)
    // would otherwise show up a second time for a plain-text coach message.
    hideAvatar: true
  };

  return (
    <div className="paged-message-card-row">
      {!isUser && <CoachAvatar persona={coachPersona} size="chat" />}
      <div className={isUser ? 'paged-message-card paged-message-card--user' : 'paged-message-card'}>
        <div className="paged-message-card__body">{renderMessageItem(message, index, visible, ctx)}</div>
      </div>
      {isUser && <UserAvatar displayName={displayName} />}
    </div>
  );
}
