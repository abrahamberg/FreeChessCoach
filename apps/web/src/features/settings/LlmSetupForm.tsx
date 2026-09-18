import type { LlmSetup, LlmSetupStatus, LlmSetupTestResponse } from '@freechesscoach/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

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

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1';
const DEFAULT_LOW_MODEL = 'gpt-5.6-luna';
const DEFAULT_HIGH_MODEL = 'gpt-5.6-terra';
const DEFAULT_VOICE_MODEL = 'gpt-4o-mini-tts';

type Phase = 'connect' | 'result' | 'phrase';

/** A controlled wizard, not a form with a spinner bolted on: while a test or
 * save is in flight the fields are gone, not just disabled; a finished test
 * replaces the form with its result instead of sitting alongside it; and the
 * phrase step only appears once a test has actually proven the connection
 * works — there's no manual "skip ahead" past a check that hasn't run. */
export function LlmSetupForm({
  status,
  onTest,
  onSave,
  onUnlockClick,
  onLock,
  onDelete,
  onStartEditing,
  testResult,
  isTesting,
  testError,
  isSaving,
  saveError
}: LlmSetupFormProps): ReactNode {
  const [editing, setEditing] = useState(!status.configured);
  const [phase, setPhase] = useState<Phase>('connect');
  const [endpoint, setEndpoint] = useState(status.endpoint ?? DEFAULT_ENDPOINT);
  const [apiKey, setApiKey] = useState('');
  const [lowModel, setLowModel] = useState(status.lowModel ?? DEFAULT_LOW_MODEL);
  const [highModel, setHighModel] = useState(status.highModel ?? DEFAULT_HIGH_MODEL);
  const [voiceModel, setVoiceModel] = useState(status.voiceModel ?? DEFAULT_VOICE_MODEL);
  const [unlockPhrase, setUnlockPhrase] = useState('');

  // Every finished test — pass or fail — lands on the result step; the form
  // only comes back if the user explicitly goes Back to edit it.
  useEffect(() => {
    if (testResult) setPhase('result');
  }, [testResult]);

  function currentSetup(): LlmSetup {
    return { endpoint, apiKey, lowModel, highModel, voiceModel };
  }

  function startEditing(): void {
    setPhase('connect');
    setEditing(true);
    onStartEditing?.();
  }

  function runTest(event: FormEvent): void {
    event.preventDefault();
    onTest(currentSetup());
  }

  function retryTest(): void {
    onTest(currentSetup());
  }

  function submitPhrase(event: FormEvent): void {
    event.preventDefault();
    onSave(currentSetup(), unlockPhrase);
  }

  if (status.configured && !editing) {
    return (
      <div className="llm-setup-form">
        {status.unlocked ? (
          <>
            <p><strong>AI setup saved</strong> ({status.protocol})</p>
            <p className="settings-page__hint">Low: {status.lowModel} · High: {status.highModel} · Voice: {status.voiceModel ?? 'not configured'}</p>
            <button type="button" className="btn-secondary" onClick={onLock}>Lock now</button>
          </>
        ) : (
          <>
            <p><strong>AI setup is locked</strong></p>
            <p className="settings-page__hint">Enter your unlock phrase to use coaching and view the saved model details.</p>
            <button type="button" className="btn-primary" onClick={onUnlockClick}>Enter unlock phrase</button>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={startEditing}>Replace setup</button>
        <button type="button" className="btn-destructive" onClick={onDelete}>Delete setup</button>
      </div>
    );
  }

  return (
    <div className="llm-setup-form llm-setup-wizard">
      <WizardSteps phase={phase} />

      {/* A fixed-footprint frame around whichever step is showing — a test
       * or save replaces its contents with a same-sized loader instead of
       * the whole card collapsing to one line and springing back, which
       * read as the section vanishing and reloading rather than a step
       * finishing. */}
      <div className="llm-setup-wizard__body">
        {isTesting || isSaving ? (
          <LoaderBlock label={isTesting ? 'Testing your connection…' : 'Saving your setup…'} />
        ) : (
          <>
            {phase === 'connect' && (
              <form onSubmit={runTest}>
                <p className="settings-page__hint">Your endpoint must support OpenAI Chat/Responses or Anthropic Messages. We make a tiny test call for low, high, and voice before saving.</p>
                <label htmlFor="llm-endpoint">API URL</label>
                <input id="llm-endpoint" type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required />
                <label htmlFor="llm-api-key">API key</label>
                <input id="llm-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required />
                <label htmlFor="llm-low-model">Low model</label>
                <input id="llm-low-model" value={lowModel} onChange={(event) => setLowModel(event.target.value)} required />
                <label htmlFor="llm-high-model">High model</label>
                <input id="llm-high-model" value={highModel} onChange={(event) => setHighModel(event.target.value)} required />
                <label htmlFor="llm-voice-model">Voice model (optional)</label>
                <input id="llm-voice-model" value={voiceModel} onChange={(event) => setVoiceModel(event.target.value)} />
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
                    <button type="button" className="btn-primary" onClick={retryTest}>Try again</button>
                  )}
                </div>
              </div>
            )}

            {phase === 'phrase' && (
              <form onSubmit={submitPhrase}>
                <p className="settings-page__hint">Last step — pick a phrase to encrypt your key with. You&rsquo;ll enter it again whenever your AI setup needs unlocking.</p>
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

function TestResults({ result }: { result: LlmSetupTestResponse }): ReactNode {
  return (
    <div role="status" className="llm-test-log">
      <div className="llm-test-log__summary">
        <span>Detected format</span>
        <span className={`badge ${result.protocol ? 'badge--success' : 'badge--danger'}`}>{result.protocol ?? 'none'}</span>
      </div>
      <ModelResultLine label="Low model" result={result.low} />
      <ModelResultLine label="High model" result={result.high} />
      {result.voice && <ModelResultLine label="Voice model" result={result.voice} multiProtocol={false} />}
    </div>
  );
}

function ModelResultLine({ label, result, multiProtocol = true }: { label: string; result: LlmSetupTestResponse['low']; multiProtocol?: boolean }): ReactNode {
  return (
    <div className="llm-test-log__row">
      <div className="llm-test-log__row-header">
        <span className="llm-test-log__label">{label}</span>
        <span className={`badge ${result.ok ? 'badge--success' : 'badge--danger'}`}>{result.ok ? 'Working' : 'Failed'}</span>
      </div>
      {!result.ok && <AttemptLog message={result.error ?? 'test failed'} multiProtocol={multiProtocol} />}
    </div>
  );
}

/** Low/high results always join every protocol tried as "<protocol>: <message>"
 * (compatibility-test.ts's bestModelResult) — split those into a per-protocol
 * trace. The voice probe only ever hits one endpoint, so its message has no
 * protocol tag and is shown as a single line. */
function AttemptLog({ message, multiProtocol }: { message: string; multiProtocol: boolean }): ReactNode {
  const attempts = multiProtocol ? message.split(' | ').map(parseProtocolAttempt) : [{ tag: null, detail: message }];
  return (
    <ul className="llm-test-log__attempts">
      {attempts.map(({ tag, detail }, index) => (
        <li key={tag ?? index}>
          {tag && <span className="llm-test-log__attempt-tag">{tag}</span>}
          <span>{detail}</span>
        </li>
      ))}
    </ul>
  );
}

function parseProtocolAttempt(attempt: string): { tag: string | null; detail: string } {
  const separatorIndex = attempt.indexOf(': ');
  if (separatorIndex === -1) return { tag: null, detail: attempt };
  return { tag: attempt.slice(0, separatorIndex), detail: attempt.slice(separatorIndex + 2) };
}
