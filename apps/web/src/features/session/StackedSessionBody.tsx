import type { ReactNode } from 'react';

export interface StackedSessionBodyProps {
  /** The compact card above the board — PagedMessageCard for a coaching
   * session, a compact BotStatusPanel for a bot game. Each owns its own
   * "which item is this, page to another one" controls in its own CoachCard
   * header now (PagedMessageCard's MessageNavPills, MoveNoteCard's move
   * label) rather than this component reserving a separate slot for them. */
  card: ReactNode;
  board: ReactNode;
  /** Pinned to the screen's bottom edge, not the end of the (scrollable)
   * stack above — omit entirely for a page with nothing to reply with (a
   * bot game with no report yet), which also drops the padding this stack
   * otherwise reserves for it (see SessionPage.css's `.has-composer`/
   * `.has-report-sheet` modifiers). */
  footer?: ReactNode;
  /** Which .board-bottom-bar variant `footer` is — a ChatComposer (a live
   * coaching session always has one) or a GameReportSummary (Play vs Bot,
   * once a report exists post-game; Review uses its own markup rather than
   * this component). Picks both the bottom-bar modifier class and how much
   * bottom padding the stack reserves, since a chat row and a collapsed
   * report ribbon are genuinely different heights. Defaults to 'composer',
   * the only kind this component rendered before Play vs Bot grew a report
   * sheet of its own. */
  footerKind?: 'composer' | 'report';
}

/** The mobile stacked layout GameReviewPage's Review page landed on first —
 * one compact card above, the board edge-to-edge below it, then a pinned
 * footer. SessionPage's live coaching session (MobileCoachSessionBody:
 * PagedMessageCard + ChatComposer) and BotSessionPage's "Play vs Bot" (a
 * compact BotStatusPanel card, no footer until a post-game report exists)
 * both reduce to this same shape now, so the shape itself lives in one place
 * instead of three copies of the same `.stacked` div. */
export function StackedSessionBody({ card, board, footer, footerKind = 'composer' }: StackedSessionBodyProps): ReactNode {
  const hasFooterClass = footerKind === 'report' ? 'has-report-sheet' : 'has-composer';
  return (
    <div className={footer ? `session-body mobile stacked ${hasFooterClass}` : 'session-body mobile stacked'}>
      {card}
      {board}
      {footer && <div className={`board-bottom-bar board-bottom-bar--${footerKind}`}>{footer}</div>}
    </div>
  );
}
