import type { PuzzleAssignment } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LightbulbIcon } from '../../components/Icon.js';
import { usePracticeAssignments } from './usePracticeAssignments.js';

function progressLabel(assignment: PuzzleAssignment): string {
  const solved = assignment.items.filter((item) => item.result !== 'pending').length;
  return `${solved} of ${assignment.items.length} puzzles`;
}

/**
 * docs/plan.md Phase 59, Task 59.6 — the dashboard's "Practice ready" card:
 * lists the student's open (background-assigned, Task 59.3) puzzle
 * batches, each with a Start/Continue action into PuzzleSessionPage.
 * Self-contained (owns its own query via usePracticeAssignments, unlike
 * FocusAreaCard/DiagnosisCard which take server data as props from
 * DashboardPage) since it's an independent, optional data source — see
 * usePracticeAssignments.ts. Empty state (including still-loading and a
 * failed fetch — a missing "you should practice" nudge is a much smaller
 * problem than an error box on an otherwise-working dashboard) renders
 * nothing, matching the "Diagnoses" section's precedent in DashboardPage.tsx
 * (Task 58.2): a section that has nothing to show simply isn't there.
 */
export function PracticeCard(): ReactNode {
  const navigate = useNavigate();
  const assignmentsQuery = usePracticeAssignments();
  const assignments = assignmentsQuery.data ?? [];

  if (assignments.length === 0) return null;

  return (
    <section aria-label="Practice ready" className="card practice-card">
      <h2>
        <LightbulbIcon width={16} height={16} strokeWidth={2.4} />
        Practice ready
      </h2>
      {assignments.map((assignment) => (
        <div key={assignment.id} className="practice-card__row">
          <div className="practice-card__details">
            <p className="practice-card__reason">{assignment.reason}</p>
            <p className="practice-card__progress">{progressLabel(assignment)}</p>
          </div>
          <button type="button" onClick={() => navigate(`/practice/${assignment.id}`)}>
            {assignment.status === 'in_progress' ? 'Continue' : 'Start'}
          </button>
        </div>
      ))}
    </section>
  );
}
