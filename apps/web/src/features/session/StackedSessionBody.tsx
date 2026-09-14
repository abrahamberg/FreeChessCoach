import { useState, type ReactNode } from 'react';
import { CoachPanel, type CoachPanelState } from '../../components/CoachPanel.js';

export interface StackedSessionBodyProps {
  /** The coach card — PagedMessageCard for a coaching session, a compact
   * BotStatusPanel for a bot game. Rides inside a CoachPanel that fills
   * whatever space is left below the board (see CoachPanel's own doc
   * comment), rather than sizing itself from its own content. */
  card: ReactNode;
  board: ReactNode;
  /** Content between the coach panel and the fixed footer — MessageNavPills
   * for a coaching session; a bot game has nothing here (its own Undo/Hint
   * controls already live inside `board`, see SessionBoardColumn). */
  belowBoard?: ReactNode;
  /** Pinned to the screen's bottom edge, not the end of the stack above —
   * omit entirely for a page with nothing to reply with (a bot never
   * talks), which also drops the padding this stack otherwise reserves for
   * it (see SessionPage.css's `.has-composer` modifier). */
  footer?: ReactNode;
}

/** The mobile stacked layout GameReviewPage's Review page landed on first —
 * the board pinned at the top, the coach card filling exactly the space
 * left before whatever's pinned at the bottom (MessageNavPills + a chat
 * composer for a coaching session; nothing for a bot game, which then gets
 * the coach card taking all the way to the true screen edge). SessionPage's
 * live coaching session (MobileCoachSessionBody: PagedMessageCard +
 * MessageNavPills + ChatComposer) and BotSessionPage's "Play vs Bot" (a
 * compact BotStatusPanel card, no footer) both reduce to this same shape,
 * so the shape itself lives in one place instead of two copies of the same
 * `.stacked` div. Owns the CoachPanel's own normal/expanded state locally
 * (plain UI state, no fetching) — same as GameReportSummary's own
 * expand/collapse. */
export function StackedSessionBody({ card, board, belowBoard, footer }: StackedSessionBodyProps): ReactNode {
  const [coachPanelState, setCoachPanelState] = useState<CoachPanelState>('normal');

  return (
    <div className={footer ? 'session-body mobile stacked has-composer' : 'session-body mobile stacked'}>
      {/* CoachPanel's `expanded` state anchors (position: absolute) to the
          nearest positioned ancestor — this wrapper, scoped to just the
          board + panel, so expanding overlaps the board only, the same way
          GameReviewPage.css's `.game-review-board-stack` does. Without it,
          `expanded` would anchor against a much larger ancestor further up
          the tree and never visibly overlap anything. */}
      <div className="coach-panel-anchor">
        {board}
        <CoachPanel state={coachPanelState} onStateChange={setCoachPanelState}>
          {card}
        </CoachPanel>
      </div>
      {belowBoard}
      {footer && <div className="session-composer-fixed">{footer}</div>}
    </div>
  );
}
