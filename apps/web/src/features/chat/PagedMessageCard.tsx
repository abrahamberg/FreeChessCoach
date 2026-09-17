import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { CoachCard } from '../../components/CoachCard.js';
import { UserAvatar } from '../../components/UserAvatar.js';
import { MessageNavPills } from './MessageNavPills.js';
import { renderMessageItem, type HoverMove, type MessageRenderContext } from './MessageList.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import { ToolActivity } from './ToolActivity.js';
import type { UseMessagePagingResult } from './useMessagePaging.js';
import './PagedMessageCard.css';

export interface PagedMessageCardProps {
  messagePaging: UseMessagePagingResult;
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
  /** design.md §5.7: the delayed 3-dot typing indicator and "checking a
   * line…" tool status, shown above this message's own text instead of a
   * fixed-height sibling block outside the card — now that the card's own
   * height no longer drives the board's position (SessionPage.css's
   * `.coach-card` flex-fill rule), mounting/unmounting either line freely
   * can no longer shift the board beneath it. */
  isThinking: boolean;
  thinkingLabel?: string | null;
  activeToolName: string | null;
}

/** SessionPage's mobile layout shows one transcript entry at a time — the
 * exact same "one card, scrollable in its own box" structure GameReviewPage
 * landed on for its note card, applied to chat messages instead of move
 * notes. MessageNavPills (paging left/right between entries — the transcript
 * equivalent of that page's MoveNavStrip) lives in this card's own header,
 * next to the avatar, the same place MoveNoteCard puts its own "which item
 * is this" content (move badge/label, its Continue-with-Coach button) — one
 * shared CoachCard header slot, not a second copy of the pattern as a
 * separate sibling row below the board. Content rendering is shared with the
 * desktop transcript via MessageList.renderMessageItem — only the container
 * (CoachCard, one entry at a time instead of a scrolling stack of every
 * message) differs. The coach's own account-level voice controls (autoplay,
 * and access to Settings/the engine indicator — otherwise unreachable on a
 * board route, see AppShell's isBoardRoute) live in SessionHeader's overflow
 * menu now, not a per-card button — a per-message play/pause button still
 * lives inline in the message text itself (renderMessageItem's own
 * coach-voice-button), which is a different, message-scoped feature. */
export function PagedMessageCard({
  messagePaging,
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
  isThinking,
  thinkingLabel = null,
  activeToolName
}: PagedMessageCardProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const { current: message, index, visible, total, goTo } = messagePaging;

  // A turn with nothing visible yet (the placeholder assistant message is
  // filtered out by visibleMessages until it has text — see
  // useMessagePaging.ts) used to fall straight to "No messages yet.", which
  // swallowed the thinking indicator/tool activity entirely on mobile —
  // most visibly on a session's kickoff turn, where the first token can be
  // a long time coming (see useCoachChat's thinkingLabel doc comment).
  if (!message) {
    return (
      <CoachCard avatar={<CoachAvatar persona={coachPersona} size="chat" />} className="paged-message-card">
        <ThinkingIndicator visible={isThinking} label={thinkingLabel} />
        <ToolActivity toolName={activeToolName} />
        {!isThinking && !activeToolName && <p className="paged-message-card__empty-text">No messages yet.</p>}
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
      header={<MessageNavPills index={index} total={total} onSelect={goTo} />}
      className={isUser ? 'paged-message-card paged-message-card--user' : 'paged-message-card'}
      expanded={expanded}
      onToggleExpand={() => setExpanded((value) => !value)}
    >
      <ThinkingIndicator visible={isThinking} label={thinkingLabel} />
      <ToolActivity toolName={activeToolName} />
      {/* Same live-region contract MessageList's own transcript container
          makes (design.md §7) — a streamed reply here should be announced
          just as it would be in the desktop transcript. */}
      <div className="paged-message-card__body" aria-live="polite">
        {renderMessageItem(message, index, visible, context)}
      </div>
    </CoachCard>
  );
}
