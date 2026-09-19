import type { PuzzleAssignment } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { LightbulbIcon } from '../../components/Icon.js';
import './ContinueSessionCard.css';

export interface PracticeContinueCardProps {
  assignment: PuzzleAssignment;
  onContinue: (assignmentId: string) => void;
}

function progressLabel(assignment: PuzzleAssignment): string {
  const solved = assignment.items.filter((item) => item.result !== 'pending').length;
  return `${solved} of ${assignment.items.length} puzzles`;
}

/** Games (home)'s "Continue" section, alongside ContinueSessionCard — a
 * pending or in-progress coach-assigned practice set is exactly the kind of
 * unfinished thing that section already exists for (Daniel's IA feedback:
 * "the thing you haven't finished is what you came back for"), but
 * GamesPage previously had no awareness of puzzle assignments at all —
 * they only ever surfaced on the dashboard's own PracticeCard. Reuses
 * ContinueSessionCard's own CSS classes rather than duplicating them: same
 * row shape, just a different icon/label/target route. */
export function PracticeContinueCard({ assignment, onContinue }: PracticeContinueCardProps): ReactNode {
  return (
    <div className="card continue-session-card">
      <LightbulbIcon width={22} height={22} className="continue-session-card__icon" />
      <div className="continue-session-card__body">
        <span className="continue-session-card__type">Practice</span>
        <span className="continue-session-card__players">{assignment.reason}</span>
        <span className="continue-session-card__meta">{progressLabel(assignment)}</span>
      </div>
      <button type="button" className="btn-primary" onClick={() => onContinue(assignment.id)}>
        {assignment.status === 'in_progress' ? 'Continue' : 'Start'}
      </button>
    </div>
  );
}
