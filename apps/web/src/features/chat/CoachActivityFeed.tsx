import type { ReactNode } from 'react';
import { useTickingNow } from '../session/useTickingNow.js';
import { useCoachActivity } from './coach-activity-context.js';
import { formatDuration, totalDuration, type ActivityStep } from './coachActivity.js';
import './CoachActivityFeed.css';

const MARKS: Record<Exclude<ActivityStep['status'], 'running'>, string> = { done: '✓', failed: '!' };

function StepRow({ step, now }: { step: ActivityStep; now: number }): ReactNode {
  return (
    <li className={`coach-activity__step coach-activity__step--${step.status}`}>
      {step.status === 'running' ? (
        <span className="coach-activity__spinner" aria-hidden="true" />
      ) : (
        <span className="coach-activity__mark" aria-hidden="true">
          {MARKS[step.status]}
        </span>
      )}
      <span className="coach-activity__label">
        {step.label}
        {step.detail && <span className="coach-activity__detail"> — {step.detail}</span>}
      </span>
      <span className="coach-activity__time">{formatDuration((step.endedAt ?? now) - step.startedAt)}</span>
    </li>
  );
}

/** The coach's tool calls for this turn, live: each one shows when it started,
 * a spinner while it runs and how long it took once it resolved. While any
 * step runs the list is open; once the turn is done it folds into one line the
 * student can open again. */
export function CoachActivityFeed(): ReactNode {
  const steps = useCoachActivity();
  const isRunning = steps.some((step) => step.status === 'running');
  const now = useTickingNow(isRunning, 250);
  if (steps.length === 0) return null;

  const rows = steps.map((step) => <StepRow key={step.id} step={step} now={now} />);
  if (isRunning) {
    return (
      <div className="coach-activity" role="status" aria-label="What the coach is doing">
        <ul className="coach-activity__steps">{rows}</ul>
      </div>
    );
  }
  return (
    <details className="coach-activity coach-activity--done">
      <summary>
        What the coach did · {steps.length} {steps.length === 1 ? 'step' : 'steps'} · {formatDuration(totalDuration(steps, now))}
      </summary>
      <ul className="coach-activity__steps">{rows}</ul>
    </details>
  );
}
