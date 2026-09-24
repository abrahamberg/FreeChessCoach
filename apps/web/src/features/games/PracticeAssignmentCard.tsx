import type { PuzzleAssignment } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { LightbulbIcon } from '../../components/Icon.js';
import './RailCard.css';

export interface PracticeAssignmentCardProps {
  assignment: PuzzleAssignment;
  onStart: (assignmentId: string) => void;
}

function progressLabel(assignment: PuzzleAssignment): string {
  const solved = assignment.items.filter((item) => item.result !== 'pending').length;
  return `${solved} of ${assignment.items.length} positions`;
}

/** One coach-assigned practice set, on the Games page's own "Practice" rail
 * (above Continue) — it used to live on the Progress page as "Practice
 * ready". Same compact card shell as the Continue cards. */
export function PracticeAssignmentCard({ assignment, onStart }: PracticeAssignmentCardProps): ReactNode {
  return (
    <div className="card rail-card">
      <div className="rail-card__top">
        <LightbulbIcon width={18} height={18} className="rail-card__icon" />
        <span className="rail-card__label">Practice</span>
      </div>
      <span className="rail-card__title rail-card__title-wrap">{assignment.reason}</span>
      <span className="rail-card__meta">{progressLabel(assignment)}</span>
      <div className="rail-card__actions">
        <button type="button" className="btn-primary" onClick={() => onStart(assignment.id)}>
          {assignment.status === 'in_progress' ? 'Continue' : 'Start'}
        </button>
      </div>
    </div>
  );
}
