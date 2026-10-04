import type { CoachPhase } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './ProgressPhaseBanner.css';

const LABELS: Record<Exclude<CoachPhase, 'review'>, { title: string; detail: string }> = {
  progress_open: { title: 'Progress check-in', detail: 'Before the game review: how your habits are doing.' },
  progress_close: { title: 'Closing the session', detail: 'After the review: what moved, and what to work on next.' }
};

/** The two progress rounds of a coaching session are about the student, not the
 * game, so the page says which one it is in. The review needs no banner. */
export function ProgressPhaseBanner({ phase }: { phase: CoachPhase }): ReactNode {
  if (phase === 'review') return null;
  const label = LABELS[phase];
  return (
    <div className="progress-phase-banner" role="status">
      <strong className="progress-phase-banner__title">{label.title}</strong>
      <span className="progress-phase-banner__detail">{label.detail}</span>
    </div>
  );
}
