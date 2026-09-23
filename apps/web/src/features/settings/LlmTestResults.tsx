import type { LlmProtocol, LlmSetupTestResponse } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export const PROTOCOL_LABELS: Record<LlmProtocol, string> = {
  'openai-responses': 'OpenAI Responses',
  anthropic: 'Anthropic Messages',
  'openai-chat': 'Chat Completions',
  local: 'Local (OpenAI-compatible)'
};

/** The test step's outcome: each model's detected format, or every format
 * it was tried with and why each failed. */
export function TestResults({ result }: { result: LlmSetupTestResponse }): ReactNode {
  return (
    <div role="status" className="llm-test-log">
      <div className="llm-test-log__summary">
        <span>Result</span>
        <span className={`badge ${result.protocol ? 'badge--success' : 'badge--danger'}`}>{result.protocol ? 'Ready' : 'Not working yet'}</span>
      </div>
      <ModelResultLine label="Low model" result={result.low} />
      <ModelResultLine label="High model" result={result.high} />
      {result.voice && <ModelResultLine label="Voice model" result={result.voice} />}
    </div>
  );
}

function ModelResultLine({ label, result }: { label: string; result: LlmSetupTestResponse['low'] }): ReactNode {
  const badge = result.ok ? (result.protocol ? PROTOCOL_LABELS[result.protocol] : 'Working') : 'Failed';
  return (
    <div className="llm-test-log__row">
      <div className="llm-test-log__row-header">
        <span className="llm-test-log__label">{label}: {result.model}</span>
        <span className={`badge ${result.ok ? 'badge--success' : 'badge--danger'}`}>{badge}</span>
      </div>
      {!result.ok && <AttemptLog message={result.error ?? 'test failed'} />}
      {result.warning && <p className="settings-page__hint llm-setup-form__error">{result.warning}</p>}
    </div>
  );
}

/** A remote failure joins every format tried as "<protocol>: <message>"
 * (compatibility-test.ts's detectModel) — split those into a per-format
 * trace. Anything else is shown as one line. */
function AttemptLog({ message }: { message: string }): ReactNode {
  const attempts = message.split(' | ').map(parseProtocolAttempt);
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
  const tag = separatorIndex === -1 ? '' : attempt.slice(0, separatorIndex);
  if (!(tag in PROTOCOL_LABELS)) return { tag: null, detail: attempt };
  return { tag: PROTOCOL_LABELS[tag as LlmProtocol], detail: attempt.slice(separatorIndex + 2) };
}
