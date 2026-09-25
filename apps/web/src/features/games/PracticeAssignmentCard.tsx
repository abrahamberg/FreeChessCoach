import type { PuzzleAssignment } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { LightbulbIcon, PlaySmallIcon } from '../../components/Icon.js';
import './GameCard.css';
import './RailCard.css';

export interface PracticeAssignmentCardProps {
  assignment: PuzzleAssignment;
  onStart: (assignmentId: string) => void;
}

/** One coach-assigned practice set, on the Games page's own "Practice" rail
 * (above Continue) — it used to live on the Progress page as "Practice
 * ready". Same compact card shell and look as the Continue and Recently
 * imported cards: a type chip, the reason, a progress bar, a status tag and
 * an icon button. */
export function PracticeAssignmentCard({ assignment, onStart }: PracticeAssignmentCardProps): ReactNode {
  const total = assignment.items.length;
  const solved = assignment.items.filter((item) => item.result !== 'pending').length;
  const inProgress = assignment.status === 'in_progress';
  const action = inProgress ? 'Continue' : 'Start';

  return (
    <div className="card rail-card">
      <div className="rail-card__top">
        <span className="rail-card__chip">
          <LightbulbIcon width={16} height={16} />
          Practice
        </span>
      </div>
      <span className="rail-card__title rail-card__title-wrap">{assignment.reason}</span>
      <progress className="rail-card__progress" value={solved} max={Math.max(total, 1)} aria-label="Positions done" />
      <span className="rail-card__meta">
        {solved} of {total} positions
      </span>
      <div className="rail-card__actions">
        <span className={inProgress ? 'badge badge--primary game-card__status' : 'badge game-card__status'}>
          {inProgress ? 'In progress' : 'New'}
        </span>
        <span className="game-card__spacer" />
        <button
          type="button"
          className="game-card__icon-action game-card__icon-action--primary"
          title={action}
          aria-label={`${action} practice: ${assignment.reason}`}
          onClick={() => onStart(assignment.id)}
        >
          <PlaySmallIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
