import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { AvatarNoteRow } from '../../components/AvatarNoteRow.js';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { VolumeOffIcon, VolumeOnIcon } from '../../components/Icon.js';
import { UserAvatar } from '../../components/UserAvatar.js';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { renderMessageItem, type HoverMove, type MessageRenderContext } from './MessageList.js';
// For .chat-pane__voice-toggle — shared with ChatPane's own desktop toggle
// rather than a second copy of the same button styling.
import './ChatPane.css';
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
  /** The account's coach-voice autoplay switch (Settings), surfaced here as
   * the row's own action button now that MobileCoachSessionBody no longer
   * has a dedicated header to put it in — undefined hides the toggle
   * entirely, same as ChatPane's own onToggleAutoplay contract. */
  autoplayEnabled?: boolean;
  onToggleAutoplay?: (enabled: boolean) => void;
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
  loadingMessageId = null,
  autoplayEnabled,
  onToggleAutoplay
}: PagedMessageCardProps): ReactNode {
  const voiceToggle = onToggleAutoplay && (
    <button
      type="button"
      className="chat-pane__voice-toggle"
      aria-label={autoplayEnabled ? 'Disable automatic coach voice' : 'Enable automatic coach voice'}
      aria-pressed={autoplayEnabled ?? false}
      title={autoplayEnabled ? 'Disable automatic coach voice' : 'Enable automatic coach voice'}
      onClick={() => onToggleAutoplay(!(autoplayEnabled ?? false))}
    >
      {autoplayEnabled ? <VolumeOnIcon width={20} height={20} /> : <VolumeOffIcon width={20} height={20} />}
    </button>
  );

  if (!message) {
    return (
      <AvatarNoteRow className="paged-message-card-row" action={voiceToggle}>
        <CoachAvatar persona={coachPersona} size="chat" />
        <div className="paged-message-card">
          <p className="paged-message-card__empty-text">No messages yet.</p>
        </div>
      </AvatarNoteRow>
    );
  }

  const isUser = message.role === 'user';
  const context: MessageRenderContext = {
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
    avatarHidden: true
  };

  return (
    <AvatarNoteRow className="paged-message-card-row" action={voiceToggle}>
      {!isUser && <CoachAvatar persona={coachPersona} size="chat" />}
      <div className={isUser ? 'paged-message-card paged-message-card--user' : 'paged-message-card'}>
        {/* Same live-region contract MessageList's own transcript container
            makes (design.md §7) — a streamed reply here should be announced
            just as it would be in the desktop transcript. */}
        <div className="paged-message-card__body" aria-live="polite">
          {renderMessageItem(message, index, visible, context)}
        </div>
      </div>
      {isUser && <UserAvatar displayName={displayName} />}
    </AvatarNoteRow>
  );
}
