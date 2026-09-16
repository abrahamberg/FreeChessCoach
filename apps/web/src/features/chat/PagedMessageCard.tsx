import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { CoachCard } from '../../components/CoachCard.js';
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
 * MessageList.renderMessageItem — only the container (CoachCard, one entry
 * at a time instead of a scrolling stack of every message) differs. The
 * coach's own account-level voice controls (autoplay, and access to
 * Settings/the engine indicator — otherwise unreachable on a board route,
 * see AppShell's isBoardRoute) live in SessionHeader's overflow menu now,
 * not a per-card button — a per-message play/pause button still lives
 * inline in the message text itself (renderMessageItem's own
 * coach-voice-button), which is a different, message-scoped feature. */
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
  const [expanded, setExpanded] = useState(false);

  if (!message) {
    return (
      <CoachCard avatar={<CoachAvatar persona={coachPersona} size="chat" />} className="paged-message-card">
        <p className="paged-message-card__empty-text">No messages yet.</p>
      </CoachCard>
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
    // The built-in inline avatar (MessageList's own "starts a coach run"
    // rule) would otherwise show up a second time for a plain-text coach
    // message — CoachCard already renders one in its header.
    avatarHidden: true
  };

  return (
    <CoachCard
      avatar={isUser ? <UserAvatar displayName={displayName} /> : <CoachAvatar persona={coachPersona} size="chat" />}
      className={isUser ? 'paged-message-card paged-message-card--user' : 'paged-message-card'}
      expanded={expanded}
      onToggleExpand={() => setExpanded((value) => !value)}
    >
      {/* Same live-region contract MessageList's own transcript container
          makes (design.md §7) — a streamed reply here should be announced
          just as it would be in the desktop transcript. */}
      <div className="paged-message-card__body" aria-live="polite">
        {renderMessageItem(message, index, visible, context)}
      </div>
    </CoachCard>
  );
}
