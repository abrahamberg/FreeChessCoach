import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import './CoachPanel.css';

export type CoachPanelState = 'normal' | 'expanded';

// A short flick shouldn't need to travel the panel's whole height to
// register — comfortably under the gap between the two snap heights, so a
// deliberate drag in either direction always finds a state to land on
// before the pointer runs out of screen.
const DRAG_THRESHOLD_PX = 48;

export interface CoachPanelProps {
  state: CoachPanelState;
  onStateChange: (state: CoachPanelState) => void;
  children: ReactNode;
}

/** The shared "coach card" for every board screen (Game Review, the live
 * Coach session, Play vs Bot) — anchored to the board's bottom edge,
 * filling exactly the space between the board (pinned at the top of the
 * screen) and whatever's pinned at the bottom (a move-nav strip, a chat
 * composer), rather than sizing itself from its own content and leaving
 * whatever's left over as bare page background. `expanded` is the one state
 * that breaks out of that budget, overlaying the board instead of sitting
 * below it — its host positions `.coach-panel--expanded` absolutely (see
 * GameReviewPage.css's `.game-review-board-stack` / SessionPage.css's
 * `.stacked`), the same collapsed-in-flow/expanded-overlay technique
 * GameReportSummary already uses for the Game Report sheet. The handle is
 * both a drag target (grab and pull to switch) and a tap target (toggles
 * normal <-> expanded) so reaching either state never depends on a drag
 * gesture landing cleanly. */
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
    const next = delta > 0 ? 'expanded' : 'normal';
    if (next !== state) onStateChange(next);
    // Re-based so a continued drag doesn't need to return to the original
    // press point to register a second step.
    dragOriginY.current = event.clientY;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!dragged.current) onStateChange(state === 'expanded' ? 'normal' : 'expanded');
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
