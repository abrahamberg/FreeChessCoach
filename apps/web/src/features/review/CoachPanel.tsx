import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import './CoachPanel.css';

export type CoachPanelState = 'peek' | 'normal' | 'expanded';

// Record lookups (not array indexing) so every step is a plain, exhaustive
// map from state to state — no out-of-range index for TS's
// noUncheckedIndexedAccess to worry about, and "drag up from expanded"/"drag
// down from peek" fall out for free as no-ops (mapping to themselves).
const NEXT_UP: Record<CoachPanelState, CoachPanelState> = { peek: 'normal', normal: 'expanded', expanded: 'expanded' };
const NEXT_DOWN: Record<CoachPanelState, CoachPanelState> = { peek: 'peek', normal: 'peek', expanded: 'normal' };
const TAP_CYCLE: Record<CoachPanelState, CoachPanelState> = { peek: 'normal', normal: 'expanded', expanded: 'peek' };

// A short flick shouldn't need to travel the panel's whole height to
// register — comfortably under the gap between any two snap heights
// (CoachPanel.css), so a deliberate drag in either direction always finds a
// state to land on before the pointer runs out of screen.
const DRAG_THRESHOLD_PX = 48;

export interface CoachPanelProps {
  state: CoachPanelState;
  onStateChange: (state: CoachPanelState) => void;
  children: ReactNode;
}

/** The board's bottom-anchored "coach panel" bottom sheet, snapping between
 * three heights instead of GameReportSummary's binary expand/collapse —
 * peek leaves the board almost entirely clear, normal is enough to read the
 * point, expanded is the only state that overlaps the board rather than
 * sitting below it in flow (its host positions
 * `.coach-panel--expanded` absolutely, the same collapsed-in-flow/expanded-
 * overlay technique GameReportSummary already uses for the Game Report
 * sheet — see GameReviewPage.css's `.game-review-board-stack`). The handle
 * is both a drag target (grab and pull towards either edge to step through
 * the three heights) and a tap target (cycles peek -> normal -> expanded ->
 * peek) so reaching any state never depends on a drag gesture landing
 * cleanly. */
export function CoachPanel({ state, onStateChange, children }: CoachPanelProps): ReactNode {
  const dragOriginY = useRef<number | null>(null);
  const dragged = useRef(false);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    dragOriginY.current = event.clientY;
    dragged.current = false;
    // Not implemented in jsdom (the test environment) — real browsers get
    // the smoother tracking-through-leave behavior, tests just skip it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (dragOriginY.current === null) return;
    const delta = dragOriginY.current - event.clientY;
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    dragged.current = true;
    const next = delta > 0 ? NEXT_UP[state] : NEXT_DOWN[state];
    if (next !== state) onStateChange(next);
    // Re-based so a continued drag can keep stepping through further states
    // rather than needing to return to the original press point each time.
    dragOriginY.current = event.clientY;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!dragged.current) onStateChange(TAP_CYCLE[state]);
    dragOriginY.current = null;
    dragged.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div className={`coach-panel coach-panel--${state}`}>
      <button
        type="button"
        className="coach-panel__handle"
        aria-label={state === 'expanded' ? 'Collapse coach panel' : 'Expand coach panel'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="coach-panel__handle-bar" aria-hidden="true" />
      </button>
      <div className="coach-panel__content">{children}</div>
    </div>
  );
}
