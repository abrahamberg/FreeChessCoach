import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { ReviewView } from './useMobileReviewView.js';

export const TAB_IDS: Record<ReviewView, string> = { board: 'review-tab-board', notes: 'review-tab-notes' };
export const PANEL_IDS: Record<ReviewView, string> = { board: 'review-panel-board', notes: 'review-panel-notes' };

export interface ReviewViewTabsProps {
  view: ReviewView;
  onSelect: (view: ReviewView) => void;
}

/** The mobile Game Review page's two-view switch — same segmented-control
 * pattern as the coaching session's Board/Coach tabs (SessionViewTabs), so
 * the notes get the full screen instead of a long scroll past the board to
 * reach them. Reuses SessionPage.css's .session-view-tabs styling verbatim
 * (loaded in the same bundle — App.tsx imports both pages), the same way
 * GameReviewPage.css already reuses .session-board-column. */
export function ReviewViewTabs({ view, onSelect }: ReviewViewTabsProps): ReactNode {
  const boardTabRef = useRef<HTMLButtonElement>(null);
  const notesTabRef = useRef<HTMLButtonElement>(null);

  function moveTo(next: ReviewView): void {
    onSelect(next);
    (next === 'board' ? boardTabRef : notesTabRef).current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowRight') return moveTo('notes');
    if (event.key === 'ArrowLeft') return moveTo('board');
  }

  return (
    <div className="session-view-tabs" role="tablist" aria-label="Review view" onKeyDown={handleKeyDown}>
      <span className="session-view-tabs__indicator" aria-hidden="true" />
      <button
        ref={boardTabRef}
        type="button"
        role="tab"
        id={TAB_IDS.board}
        aria-selected={view === 'board'}
        aria-controls={PANEL_IDS.board}
        tabIndex={view === 'board' ? 0 : -1}
        onClick={() => onSelect('board')}
      >
        Board
      </button>
      <button
        ref={notesTabRef}
        type="button"
        role="tab"
        id={TAB_IDS.notes}
        aria-selected={view === 'notes'}
        aria-controls={PANEL_IDS.notes}
        tabIndex={view === 'notes' ? 0 : -1}
        onClick={() => onSelect('notes')}
      >
        Notes
      </button>
    </div>
  );
}
