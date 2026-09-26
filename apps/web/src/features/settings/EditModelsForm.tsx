import type { LlmSetupStatus } from '@freechesscoach/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { ConfirmPhraseStep } from './ConfirmPhraseStep.js';
import { EditModelsFields, useModelsChangeDraft } from './EditModelsFields.js';
import { TestResults } from './LlmTestResults.js';
import { ErrorBox, LoaderBlock, WizardSteps } from './SetupWizardParts.js';
import { useChangeModels } from './useChangeModels.js';

const STEP_LABELS = ['Choose models', 'Confirm with your phrase'] as const;

type Phase = 'models' | 'result' | 'phrase';

/** The same wizard as a new setup, for a saved one: choose models, see each
 * model's test result, then confirm with the unlock phrase. The endpoint and
 * key stay as saved, so the key is never asked for. */
export function EditModelsForm({ status, onDone }: { status: LlmSetupStatus; onDone: () => void }): ReactNode {
  const [phase, setPhase] = useState<Phase>('models');
  const draft = useModelsChangeDraft(status);
  const { test, save } = useChangeModels();

  function runTest(event?: FormEvent): void {
    event?.preventDefault();
    save.reset();
    test.mutate(draft.toChange(), { onSuccess: () => setPhase('result') });
  }

  function saveWith(unlockPhrase: string, newUnlockPhrase: string | undefined): void {
    save.mutate({ ...draft.toChange(), unlockPhrase, newUnlockPhrase }, { onSuccess: onDone });
  }

  const busy = test.isPending || save.isPending;
  return (
    <div className="llm-setup-form llm-setup-wizard">
      <WizardSteps labels={STEP_LABELS} active={phase === 'phrase' ? 1 : 0} />
      <div className="llm-setup-wizard__body">
        {busy ? (
          <LoaderBlock label={test.isPending ? 'Testing your models…' : 'Saving your models…'} />
        ) : (
          <>
            {phase === 'models' && (
              <form onSubmit={runTest}>
                <EditModelsFields status={status} draft={draft} />
                <div className="llm-setup-form__actions">
                  <button type="submit" className="btn-primary">Test models</button>
                </div>
                <ErrorBox title="The test could not run" message={describeApiError(test.error)} />
              </form>
            )}

            {phase === 'result' && test.data && (
              <div className="llm-setup-form__result">
                <TestResults result={test.data} />
                <div className="llm-setup-form__actions">
                  <button type="button" className="btn-secondary" onClick={() => setPhase('models')}>Back</button>
                  {test.data.protocol ? (
                    <button type="button" className="btn-primary" onClick={() => setPhase('phrase')}>Proceed</button>
                  ) : (
                    <button type="button" className="btn-primary" onClick={() => runTest()}>Try again</button>
                  )}
                </div>
              </div>
            )}

            {phase === 'phrase' && <ConfirmPhraseStep onBack={() => setPhase('result')} onSave={saveWith} saveError={describeApiError(save.error)} />}
          </>
        )}
      </div>
      {!busy && (
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      )}
    </div>
  );
}
