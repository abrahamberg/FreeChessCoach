import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLlmSetupStatus } from '../../hooks/useLlmSetupStatus.js';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile.js';
import { CoachPersonaSelect } from '../settings/CoachPersonaSelect.js';
import { EngineFields } from '../settings/EngineFields.js';
import { LinkedAccountsFields } from '../settings/LinkedAccountsFields.js';
import { ProfileFields } from '../settings/ProfileFields.js';
import { VoiceFields } from '../settings/VoiceFields.js';
import '../settings/SettingsPage.css';
import { AiStep } from './AiStep.js';
import { BugsStep } from './BugsStep.js';
import { CoachSpeech } from './CoachSpeech.js';
import { DoneStep } from './DoneStep.js';
import { HabitsStep } from './HabitsStep.js';
import { OnboardingProgress } from './OnboardingProgress.js';
import { TourStep } from './TourStep.js';
import { coachSays, ONBOARDING_STEPS, type OnboardingStep } from './coach-lines.js';
import './OnboardingPage.css';

function stepIndexFromParam(param: string | null): number {
  const index = ONBOARDING_STEPS.findIndex((candidate) => candidate === param);
  return index === -1 ? 0 : index;
}

/** `/welcome`: the guided first-run setup. Each step renders the very same
 * component Settings uses (ProfileFields, CoachPersonaSelect, EngineFields,
 * LinkedAccountsFields, LlmSetupSection, VoiceFields), so a change to one
 * shows up in both. The coach picked on step 2 narrates the steps after it.
 * Every choice saves as it is made; only finishing or skipping marks the
 * flow done. */
export function OnboardingPage(): ReactNode {
  const navigate = useNavigate();
  const profileQuery = useProfile();
  const llmSetupQuery = useLlmSetupStatus();
  const update = useUpdateProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const stepIndex = stepIndexFromParam(searchParams.get('step'));
  const profile = profileQuery.data;
  const llmSetup = llmSetupQuery.data;

  if (!profile || !llmSetup) {
    if (profileQuery.isError || llmSetupQuery.isError) return <p className="page">Could not load your setup.</p>;
    return <p className="page">Loading…</p>;
  }

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex] ?? 'done';
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;
  const nextLabel = step === 'ai' && !llmSetup.configured ? 'Skip for now' : 'Next';

  // The step lives in the URL so the live demo can send the student back to it.
  function goTo(index: number): void {
    setSearchParams({ step: ONBOARDING_STEPS[Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1)] ?? 'you' });
  }

  function finish(destination: string): void {
    update.mutate({ onboarded: true }, { onSuccess: () => navigate(destination, { replace: true }) });
  }

  return (
    <div className="page onboarding">
      <header className="onboarding__header">
        <OnboardingProgress current={step} />
        <button type="button" className="btn-ghost" onClick={() => finish('/games')} disabled={update.isPending}>
          Skip setup
        </button>
      </header>

      <CoachSpeech persona={profile.coachPersona} text={coachSays(step, { persona: profile.coachPersona, aiConfigured: llmSetup.configured })} />

      <section className="card onboarding__body" aria-label={step}>
        {step === 'you' && <ProfileFields profile={profile} askName />}
        {step === 'coach' && (
          <CoachPersonaSelect value={profile.coachPersona} onChange={(coachPersona) => update.mutate({ coachPersona })} />
        )}
        {step === 'engine' && <EngineFields profile={profile} />}
        {step === 'accounts' && <LinkedAccountsFields profile={profile} />}
        {step === 'tour' && <TourStep />}
        {step === 'ai' && <AiStep status={llmSetup} />}
        {step === 'voice' && <VoiceFields profile={profile} llmSetup={llmSetup} />}
        {step === 'bugs' && <BugsStep />}
        {step === 'habits' && <HabitsStep />}
        {step === 'done' && <DoneStep />}
      </section>

      {update.isError && <p role="alert">Could not save that. Try again.</p>}

      <footer className="onboarding__nav">
        <button type="button" className="btn-secondary" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
          Back
        </button>
        {isLast ? (
          <button type="button" className="btn-primary" onClick={() => finish('/import')} disabled={update.isPending}>
            Import my first game
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => goTo(stepIndex + 1)}>{nextLabel}</button>
        )}
      </footer>
    </div>
  );
}
