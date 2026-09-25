import type { ReactNode } from 'react';
import { ONBOARDING_STEPS, STEP_LABELS, type OnboardingStep } from './coach-lines.js';

/** The wizard's step dots; the current one is named, past ones are ticked. */
export function OnboardingProgress({ current }: { current: OnboardingStep }): ReactNode {
  const currentIndex = ONBOARDING_STEPS.indexOf(current);
  return (
    <ol className="onboarding__progress" aria-label="Setup progress">
      {ONBOARDING_STEPS.map((step, index) => (
        <li
          key={step}
          className={index === currentIndex ? 'is-current' : index < currentIndex ? 'is-done' : undefined}
          aria-current={index === currentIndex ? 'step' : undefined}
        >
          <span className="onboarding__dot">{index < currentIndex ? '✓' : index + 1}</span>
          <span className="onboarding__step-label">{STEP_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  );
}
