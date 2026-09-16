import type { LlmSetup, LlmSetupStatus, LlmSetupTestResponse } from '@freechesscoach/shared';
import { useState, type FormEvent, type ReactNode } from 'react';

export interface LlmSetupFormProps {
  status: LlmSetupStatus;
  onTest: (setup: LlmSetup) => void;
  onSave: (setup: LlmSetup, unlockPhrase: string) => void;
  onUnlock: (unlockPhrase: string) => void;
  onLock: () => void;
  onDelete: () => void;
  testResult?: LlmSetupTestResponse;
  error?: string;
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1';
const DEFAULT_LOW_MODEL = 'gpt-5.6-luna';
const DEFAULT_HIGH_MODEL = 'gpt-5.6-terra';
const DEFAULT_VOICE_MODEL = 'gpt-4o-mini-tts';

export function LlmSetupForm({ status, onTest, onSave, onUnlock, onLock, onDelete, testResult, error }: LlmSetupFormProps): ReactNode {
  const [editing, setEditing] = useState(!status.configured);
  const [endpoint, setEndpoint] = useState(status.endpoint ?? DEFAULT_ENDPOINT);
  const [apiKey, setApiKey] = useState('');
  const [lowModel, setLowModel] = useState(status.lowModel ?? DEFAULT_LOW_MODEL);
  const [highModel, setHighModel] = useState(status.highModel ?? DEFAULT_HIGH_MODEL);
  const [voiceModel, setVoiceModel] = useState(status.voiceModel ?? DEFAULT_VOICE_MODEL);
  const [unlockPhrase, setUnlockPhrase] = useState('');

  function currentSetup(): LlmSetup {
    return { endpoint, apiKey, lowModel, highModel, voiceModel };
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    onSave(currentSetup(), unlockPhrase);
    setApiKey('');
    setUnlockPhrase('');
    setEditing(false);
  }

  if (status.configured && !editing) {
    return (
      <div className="llm-setup-form">
        {status.unlocked ? (
          <>
            <p><strong>AI setup saved</strong> ({status.protocol})</p>
            <p className="settings-page__hint">Low: {status.lowModel} · High: {status.highModel} · Voice: {status.voiceModel ?? 'not configured'}</p>
            <button type="button" onClick={onLock}>Lock now</button>
          </>
        ) : (
          <>
            <p><strong>AI setup is locked</strong></p>
            <p className="settings-page__hint">Enter your unlock phrase to use coaching and view the saved model details.</p>
            <form onSubmit={(event) => { event.preventDefault(); onUnlock(unlockPhrase); setUnlockPhrase(''); }}>
              <label htmlFor="llm-unlock-phrase">Unlock phrase</label>
              <input id="llm-unlock-phrase" type="password" value={unlockPhrase} onChange={(event) => setUnlockPhrase(event.target.value)} />
              <button type="submit" className="btn-primary">Unlock</button>
            </form>
          </>
        )}
        <button type="button" onClick={() => setEditing(true)}>Replace setup</button>
        <button type="button" onClick={onDelete}>Delete setup</button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form className="llm-setup-form" onSubmit={submit}>
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
      <label htmlFor="llm-save-phrase">Unlock phrase (8+ characters)</label>
      <input id="llm-save-phrase" type="password" value={unlockPhrase} onChange={(event) => setUnlockPhrase(event.target.value)} minLength={8} required />
      <div className="llm-setup-form__actions">
        <button type="button" onClick={() => onTest(currentSetup())}>Test models</button>
        <button type="submit" className="btn-primary">Test and save</button>
      </div>
      {testResult && <TestResults result={testResult} />}
      {status.configured && <button type="button" onClick={() => setEditing(false)}>Cancel</button>}
      {error && <p role="alert">{error}</p>}
    </form>
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
