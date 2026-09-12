import type { ReactNode } from 'react';
import './AvatarNoteRow.css';

export interface AvatarNoteRowProps {
  /** A small control anchored at the row's far end (e.g. a voice-autoplay
   * toggle) — its own row item, not part of the card itself, so it stays
   * reachable regardless of which card content is showing. */
  action?: ReactNode;
  /** Extra class names appended to the base 'avatar-note-row' — callers keep
   * their own modifier (e.g. 'move-note-card-row') for any page-specific
   * CSS that targets it, without redefining the shared row layout. */
  className?: string;
  /** The portrait (CoachAvatar/UserAvatar/BotAvatar) plus the card itself —
   * left as the caller's own children, not a dedicated `avatar` slot, since
   * which side the portrait sits on varies (PagedMessageCard puts the
   * student's own initials on the right instead of the coach's portrait on
   * the left). */
  children: ReactNode;
}

/** chess.com's own reference: a portrait beside a card, not the card alone.
 * GameReviewPage's MoveNoteCard and SessionPage's PagedMessageCard each
 * built this same row independently (a portrait as a fixed-width sibling,
 * the card taking the rest via min-width: 0) — factored out once both
 * existed, so the layout has one source of truth instead of two copies of
 * the same three-line flex rule. */
export function AvatarNoteRow({ action, className, children }: AvatarNoteRowProps): ReactNode {
  return (
    <div className={className ? `avatar-note-row ${className}` : 'avatar-note-row'}>
      {children}
      {action && <div className="avatar-note-row__action">{action}</div>}
    </div>
  );
}
