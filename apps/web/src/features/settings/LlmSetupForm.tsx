import type { LlmProtocol, LlmSetup, LlmSetupStatus, LlmSetupTestResponse, ReasoningEffort } from '@freechesscoach/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CloudLlmFields } from './CloudLlmFields.js';
import { PROTOCOL_LABELS, TestResults } from './LlmTestResults.js';
import { LocalLlmFields } from './LocalLlmFields.js';
import { useLlmSetupDraft } from './useLlmSetupDraft.js';

export interface LlmSetupFormProps {
  status: LlmSetupStatus;
  onTest: (setup: LlmSetup) => void;
  onSave: (setup: LlmSetup, unlockPhrase: string) => void;
  /** Opens the shared UnlockPhraseModal (SettingsPage owns the mutation) —
   * the phrase is entered there now, not inline. */
  onUnlockClick: () => void;
  onLock: () => void;
  onDelete: () => void;
  /** Fires when a fresh connect/replace wizard opens, so the caller can
   * clear a test/save result left over from a previous attempt — the
   * mutations live in SettingsPage and otherwise outlive this form. */
  onStartEditing?: () => void;
  testResult?: LlmSetupTestResponse;
  isTesting: boolean;
  testError?: string;
  isSaving: boolean;
  saveError?: string;
}

type Phase = 'connect' | 'result' | 'phrase';

const THINKING_LABELS: Partial<Record<ReasoningEffort, string>> = { none: 'off', low: 'low', medium: 'medium', high: 'high' };

/** A controlled wizard, not a form with a spinner bolted on: while a test or
 * save is in flight the fields are gone, not just disabled; a finished test
 * replaces the form with its result instead of sitting alongside it; and the
 * phrase step only appears once a test has actually proven the connection
 * works — there's no manual "skip ahead" past a check that hasn't run. */
export function LlmSetupForm(props: LlmSetupFormProps): ReactNode {
  const { status, onTest, onSave, onStartEditing, testResult, isTesting, testError, isSaving, saveError } = props;
  const [editing, setEditing] = useState(!status.configured);
  const [phase, setPhase] = useState<Phase>('connect');
  const [unlockPhrase, setUnlockPhrase] = useState('');
  const api = useLlmSetupDraft(status);

  // Every finished test — pass or fail — lands on the result step; the form
  // only comes back if the user explicitly goes Back to edit it.
  useEffect(() => {
    if (testResult) setPhase('result');
  }, [testResult]);

  if (status.configured && !editing) {
    return (
      <SavedSetupSummary
        {...props}
        onReplace={() => {
          setPhase('connect');
          setEditing(true);
          onStartEditing?.();
        }}
      />
    );
  }

  function runTest(event: FormEvent): void {
    event.preventDefault();
    onTest(api.toSetup());
  }

  function submitPhrase(event: FormEvent): void {
    event.preventDefault();
    onSave(api.toSetup(), unlockPhrase);
  }

  return (
    <div className="llm-setup-form llm-setup-wizard">
      <WizardSteps phase={phase} />

      {/* A fixed-footprint frame around whichever step is showing — a test
       * or save replaces its contents with a same-sized loader instead of
       * the whole card collapsing to one line and springing back. */}
      <div className="llm-setup-wizard__body">
        {isTesting || isSaving ? (
          <LoaderBlock label={isTesting ? 'Testing your connection…' : 'Saving your setup…'} />
        ) : (
          <>
            {phase === 'connect' && (
              <form onSubmit={runTest}>
                <fieldset className="llm-setup-form__kind">
                  <legend>Where your AI runs</legend>
                  <label className="llm-setup-form__checkbox">
                    <input type="radio" name="llm-kind" checked={api.draft.kind === 'cloud'} onChange={() => api.setKind('cloud')} />
                    Cloud / API endpoint
                  </label>
                  <label className="llm-setup-form__checkbox">
                    <input type="radio" name="llm-kind" checked={api.draft.kind === 'local'} onChange={() => api.setKind('local')} />
                    On my computer (LM Studio / Ollama)
                  </label>
                </fieldset>
                {api.draft.kind === 'cloud' ? <CloudLlmFields api={api} /> : <LocalLlmFields api={api} />}
                <div className="llm-setup-form__actions">
                  <button type="submit" className="btn-primary">Test connection</button>
                </div>
                {testError && <p role="alert">{testError}</p>}
              </form>
            )}

            {phase === 'result' && testResult && (
              <div className="llm-setup-form__result">
                <TestResults result={testResult} />
                <div className="llm-setup-form__actions">
                  <button type="button" className="btn-secondary" onClick={() => setPhase('connect')}>Back</button>
                  {testResult.protocol ? (
                    <button type="button" className="btn-primary" onClick={() => setPhase('phrase')}>Proceed</button>
                  ) : (
                    <button type="button" className="btn-primary" onClick={() => onTest(api.toSetup())}>Try again</button>
                  )}
                </div>
              </div>
            )}

            {phase === 'phrase' && (
              <form onSubmit={submitPhrase}>
                <p className="settings-page__hint">Last step — pick a phrase to encrypt your setup with. You&rsquo;ll enter it again whenever your AI setup needs unlocking.</p>
                <label htmlFor="llm-save-phrase">Unlock phrase (8+ characters)</label>
                <input id="llm-save-phrase" type="password" value={unlockPhrase} onChange={(event) => setUnlockPhrase(event.target.value)} minLength={8} required autoFocus />
                <div className="llm-setup-form__actions">
                  <button type="button" className="btn-secondary" onClick={() => setPhase('result')}>Back</button>
                  <button type="submit" className="btn-primary">Save</button>
                </div>
                {saveError && <p role="alert">{saveError}</p>}
              </form>
            )}
          </>
        )}
      </div>

      {status.configured && !isTesting && !isSaving && (
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
      )}
    </div>
  );
}

function SavedSetupSummary({ status, onUnlockClick, onLock, onDelete, onReplace }: LlmSetupFormProps & { onReplace: () => void }): ReactNode {
  const isLocal = status.protocol === 'local';
  const where = isLocal ? `on your computer (${status.localType === 'ollama' ? 'Ollama' : status.localType === 'other' ? 'local server' : 'LM Studio'})` : status.endpoint;
  return (
    <div className="llm-setup-form">
      {status.unlocked ? (
        <>
          <p><strong>AI setup saved</strong> — {where}</p>
          <p className="settings-page__hint">
            Low: {modelLine(status.lowModel ?? status.highModel, status.lowProtocol ?? status.protocol, status.reasoning?.light)} · High:{' '}
            {modelLine(status.highModel, status.highProtocol ?? status.protocol, status.reasoning?.standard)}
            {!isLocal && ` · Voice: ${status.voiceModel ?? 'not configured'} · Flex: ${status.useFlex ? 'on' : 'off'}`}
          </p>
          <button type="button" className="btn-secondary" onClick={onLock}>Lock now</button>
        </>
      ) : (
        <>
          <p><strong>AI setup is locked</strong></p>
          <p className="settings-page__hint">Enter your unlock phrase to use coaching and view the saved model details.</p>
          <button type="button" className="btn-primary" onClick={onUnlockClick}>Enter unlock phrase</button>
        </>
      )}
      <button type="button" className="btn-secondary" onClick={onReplace}>Replace setup</button>
      <button type="button" className="btn-destructive" onClick={onDelete}>Delete setup</button>
    </div>
  );
}

function modelLine(model: string | undefined, protocol: LlmProtocol | undefined, thinking: ReasoningEffort | undefined): string {
  const parts = [protocol && protocol !== 'local' ? PROTOCOL_LABELS[protocol] : null, thinking ? `thinking ${THINKING_LABELS[thinking] ?? thinking}` : null];
  const detail = parts.filter(Boolean).join(', ');
  return `${model ?? '—'}${detail ? ` (${detail})` : ''}`;
}

function WizardSteps({ phase }: { phase: Phase }): ReactNode {
  return (
    <ol className="llm-setup-wizard__steps" aria-label="Setup steps">
      <li className={`llm-setup-wizard__step ${phase === 'phrase' ? 'is-done' : 'is-active'}`}>
        <span className="llm-setup-wizard__step-number" aria-hidden="true">1</span>
        Connect your AI
      </li>
      <li className={`llm-setup-wizard__step ${phase === 'phrase' ? 'is-active' : ''}`}>
        <span className="llm-setup-wizard__step-number" aria-hidden="true">2</span>
        Set an unlock phrase
      </li>
    </ol>
  );
}

function LoaderBlock({ label }: { label: string }): ReactNode {
  return (
    <p className="llm-setup-form__loader" role="status">
      <span className="llm-setup-form__spinner" aria-hidden="true" />
      {label}
    </p>
  );
}
