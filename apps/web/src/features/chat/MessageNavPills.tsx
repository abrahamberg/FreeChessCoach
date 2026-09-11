import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, SkipBackIcon, SkipForwardIcon } from '../../components/Icon.js';

export interface MessageNavPillsProps {
  index: number;
  total: number;
  onSelect: (index: number) => void;
}

/** SessionPage's mobile layout: first/prev/next/last across the transcript,
 * paging PagedMessageCard one message at a time — the same
 * first/prev/"N of M"/next/last pattern GameReviewPage's MoveNavPills uses
 * for moves, applied to messages instead (a small, deliberate duplicate
 * rather than a shared import — reusing that component here would couple
 * the review and chat feature folders for a ~30-line pattern, and "move X
 * of Y" is the wrong word for a chat transcript). */
export function MessageNavPills({ index, total, onSelect }: MessageNavPillsProps): ReactNode {
  function goTo(next: number): void {
    onSelect(Math.min(Math.max(next, 0), Math.max(total - 1, 0)));
  }

  return (
    <div className="move-explorer__nav">
      <button type="button" aria-label="first message" onClick={() => goTo(0)} disabled={index <= 0}>
        <SkipBackIcon width={15} height={15} />
      </button>
      <button type="button" aria-label="previous message" onClick={() => goTo(index - 1)} disabled={index <= 0}>
        <ChevronLeftIcon width={16} height={16} />
      </button>
      <span className="move-explorer__position">
        message {total === 0 ? 0 : index + 1} of {total}
      </span>
      <button type="button" aria-label="next message" onClick={() => goTo(index + 1)} disabled={index >= total - 1}>
        <ChevronRightIcon width={16} height={16} />
      </button>
      <button type="button" aria-label="last message" onClick={() => goTo(total - 1)} disabled={index >= total - 1}>
        <SkipForwardIcon width={15} height={15} />
      </button>
    </div>
  );
}
