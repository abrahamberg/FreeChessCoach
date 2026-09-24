import type { PuzzleAssignmentItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './PuzzlePlanStrip.css';

export interface PuzzlePlanStripProps {
  items: PuzzleAssignmentItem[];
  currentItemIndex: number;
  /** True once the current item's known line has been fully played out
   * (usePuzzleSessionPageData's lineComplete) — the item's stored `result`
   * only flips away from 'pending' once the session actually advances past
   * it, so this is what lets the strip show "solved" the instant it
   * happens, and what shows the "Next practice" action. */
  lineComplete: boolean;
  isAdvancing: boolean;
  onAdvance: () => void;
}

type ItemStatus = 'solved' | 'failed' | 'skipped' | 'current' | 'pending';

function statusFor(item: PuzzleAssignmentItem, isCurrent: boolean, lineComplete: boolean): ItemStatus {
  if (item.result !== 'pending') return item.result;
  if (isCurrent) return lineComplete ? 'solved' : 'current';
  return 'pending';
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  solved: 'solved',
  failed: 'revealed',
  skipped: 'skipped',
  current: 'in progress',
  pending: 'not started yet'
};

/**
 * Sits under the move explorer in a puzzle session — the puzzle-level
 * equivalent of MoveExplorer's per-move quality coloring, so a student can
 * see at a glance which of the batch's items are done, which one is current,
 * and which are still ahead. Previously nothing showed this at all: the
 * page's own header only ever said "Item N of M", with no per-item status
 * and no way to move on once solved that didn't depend on the coach's own
 * advance_puzzle tool call (see usePuzzleSessionPageData.ts's lineComplete).
 */
export function PuzzlePlanStrip({ items, currentItemIndex, lineComplete, isAdvancing, onAdvance }: PuzzlePlanStripProps): ReactNode {
  return (
    <div className="puzzle-plan-strip">
      <ol className="puzzle-plan-strip__list">
        {items.map((item, index) => {
          const isCurrent = index === currentItemIndex;
          const status = statusFor(item, isCurrent, lineComplete);
          return (
            <li
              key={item.puzzleId}
              className={`puzzle-plan-strip__item puzzle-plan-strip__item--${status}`}
              aria-current={isCurrent ? 'true' : undefined}
              title={`Practice ${index + 1} — ${STATUS_LABEL[status]}`}
            >
              {index + 1}
            </li>
          );
        })}
      </ol>
      {lineComplete && (
        <button type="button" className="btn-primary puzzle-plan-strip__next" onClick={onAdvance} disabled={isAdvancing}>
          {isAdvancing ? 'Loading next practice…' : 'Next practice →'}
        </button>
      )}
    </div>
  );
}
