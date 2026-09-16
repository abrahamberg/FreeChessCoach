import type { ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from './Icon.js';
import './CoachCard.css';

export interface CoachCardProps {
  /** The portrait (CoachAvatar/BotAvatar/UserAvatar) — sized down to a small
   * inline icon by this component's own CSS regardless of the size variant
   * the caller passes, so it reads as "whose card is this" without costing
   * a whole side column the way a full portrait beside the card used to
   * (SessionPage/GameReviewPage/BotSessionPage's shared redesign). */
  avatar: ReactNode;
  /** Extra content in the header row, after the avatar — a move's quality
   * badge/label/headline (MoveNoteCard), a bot's name/rating
   * (BotStatusPanel), or omitted entirely for a plain avatar-only header
   * (PagedMessageCard, which has nothing else to say there). */
  header?: ReactNode;
  /** Caller's own modifier class(es) — kept alongside 'coach-card' (not
   * replacing it) so each caller's existing content-specific CSS
   * (.move-note-card__body, .paged-message-card__empty-text, ...) keeps
   * working unchanged; only the shared box chrome now lives here. */
  className?: string;
  /** Present (and clickable) only when there's something to expand into —
   * omit entirely for a card with nothing worth a second, larger read (e.g.
   * PagedMessageCard's own "No messages yet" empty state). */
  expanded?: boolean;
  onToggleExpand?: () => void;
  children: ReactNode;
}

/** The one card shell every board view's "coach note" now shares —
 * PagedMessageCard's chat bubble, MoveNoteCard's move note, BotStatusPanel's
 * status card. The portrait sits inside the card's own header row (small,
 * top-left) instead of as a full-height sibling column beside it — the
 * header row's leftover width goes to `header` content instead of empty
 * space. `expanded` grows the text area into an overlay that reaches down
 * toward the board without moving it (or anything below it) — see
 * CoachCard.css's `--expanded` rule: the collapsed slot's height is always
 * reserved in flow, so toggling never shifts the board/move list/composer
 * beneath it. */
export function CoachCard({ avatar, header, className, expanded = false, onToggleExpand, children }: CoachCardProps): ReactNode {
  const rootClassName = ['coach-card', expanded && 'coach-card--expanded', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      <div className="coach-card__header">
        <span className="coach-card__avatar">{avatar}</span>
        {header}
      </div>
      <div className="coach-card__slot">
        <div className="coach-card__panel">
          <div className="coach-card__text">{children}</div>
        </div>
        {onToggleExpand && (
          <button
            type="button"
            className="coach-card__expand-toggle"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show less' : 'Show more'}
            title={expanded ? 'Show less' : 'Show more'}
          >
            {expanded ? <ChevronDownIcon width={16} height={16} /> : <ChevronUpIcon width={16} height={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
