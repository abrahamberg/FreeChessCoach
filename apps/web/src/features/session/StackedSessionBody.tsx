import type { ReactNode } from 'react';

export interface StackedSessionBodyProps {
  /** The compact card above the board — PagedMessageCard for a coaching
   * session, a compact BotStatusPanel for a bot game. */
  card: ReactNode;
  board: ReactNode;
  /** Content between the board and the fixed footer — MessageNavPills for a
   * coaching session; a bot game has nothing here (its own Undo/Hint
   * controls already live inside `board`, see SessionBoardColumn). */
  belowBoard?: ReactNode;
  /** Pinned to the screen's bottom edge, not the end of the (scrollable)
   * stack above — omit entirely for a page with nothing to reply with (a
   * bot never talks), which also drops the padding this stack otherwise
   * reserves for it (see SessionPage.css's `.has-composer` modifier). */
  footer?: ReactNode;
}

/** The mobile stacked layout GameReviewPage's Review page landed on first —
 * one compact card above, the board edge-to-edge below it, then whatever
 * belongs between the board and a pinned footer. SessionPage's live coaching
 * session (MobileCoachSessionBody: PagedMessageCard + MessageNavPills +
 * ChatComposer) and BotSessionPage's "Play vs Bot" (a compact BotStatusPanel
 * card, no footer — a bot never talks) both reduce to this same shape now,
 * so the shape itself lives in one place instead of three copies of the
 * same `.stacked` div. */
export function StackedSessionBody({ card, board, belowBoard, footer }: StackedSessionBodyProps): ReactNode {
  return (
    <div className={footer ? 'session-body mobile stacked has-composer' : 'session-body mobile stacked'}>
      {card}
      {board}
      {belowBoard}
      {footer && <div className="session-composer-fixed">{footer}</div>}
    </div>
  );
}
