import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useHorizontalSwipe } from '../../hooks/useHorizontalSwipe.js';
import { SessionPeekBar } from '../session/SessionPeekBar.js';
import { PANEL_IDS, ReviewViewTabs, TAB_IDS } from './ReviewViewTabs.js';
import type { ReviewView, UseMobileReviewViewResult } from './useMobileReviewView.js';

/** Piece dragging owns the board's own touch handling — a drag starting
 * anywhere else in the track becomes a panel swipe instead. Unlike the
 * coaching session's mobile body, the notes panel has nothing that owns
 * horizontal touch of its own (the move list only scrolls vertically), so it
 * needs no reservation. */
const SWIPE_RESERVED_SELECTOR = '.coach-board-frame';

export interface MobileReviewBodyProps {
  board: ReactNode;
  notes: ReactNode;
  /** The position currently on the board — drawn in the notes panel's peek
   * bar so a tapped move's position isn't lost while reading its note. */
  fen: string;
  positionLabel: string;
  viewState: UseMobileReviewViewResult;
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function progressFor(view: ReviewView, dragPx: number, width: number): number {
  const base = view === 'notes' ? 1 : 0;
  if (dragPx === 0 || width === 0) return base;
  return clampProgress(base - dragPx / width);
}

/** Below GameReviewPage's own desktop breakpoint, board and notes each own
 * the full screen — switched by the segmented control or a horizontal swipe,
 * mirroring the coaching session's MobileSessionBody (see its own doc
 * comment for why both panels stay mounted rather than one being unmounted
 * on switch: hiding one with display:none would zero its height, silently
 * breaking the board's sizing and the move list's scroll position). */
export function MobileReviewBody({ board, notes, fen, positionLabel, viewState }: MobileReviewBodyProps): ReactNode {
  const { view, select, showBoard } = viewState;
  const viewportRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const [dragPx, setDragPx] = useState(0);

  const handleDrag = useCallback((dx: number) => {
    if (dx === 0) widthRef.current = 0;
    else if (widthRef.current === 0) widthRef.current = viewportRef.current?.offsetWidth ?? 0;
    setDragPx(dx);
  }, []);

  const swipeHandlers = useHorizontalSwipe({
    onSwipeLeft: viewState.showNotes,
    onSwipeRight: showBoard,
    reservedSelector: SWIPE_RESERVED_SELECTOR,
    onDrag: handleDrag
  });

  const progress = progressFor(view, dragPx, widthRef.current);
  const style = { '--session-view-progress': progress } as CSSProperties;

  return (
    <div className="session-body mobile" style={style} data-view={view} data-dragging={dragPx === 0 ? undefined : 'true'}>
      <ReviewViewTabs view={view} onSelect={select} />
      <div className="session-views" ref={viewportRef} {...swipeHandlers}>
        <div className="session-views__track">
          <section
            className="session-view"
            id={PANEL_IDS.board}
            role="tabpanel"
            aria-labelledby={TAB_IDS.board}
            aria-hidden={view !== 'board'}
            inert={view !== 'board'}
          >
            {board}
          </section>
          <section
            className="session-view game-review-notes-panel"
            id={PANEL_IDS.notes}
            role="tabpanel"
            aria-labelledby={TAB_IDS.notes}
            aria-hidden={view !== 'notes'}
            inert={view !== 'notes'}
          >
            <SessionPeekBar fen={fen} label={positionLabel} onShowBoard={showBoard} />
            {notes}
          </section>
        </div>
      </div>
    </div>
  );
}
