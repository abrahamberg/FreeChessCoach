import type { LlmSetupStatus } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { LlmSetupSection } from '../settings/LlmSetupSection.js';
import { OpenAiChecklist } from './OpenAiChecklist.js';

type AiChoice = 'choose' | 'openai' | 'local';

/** Optional AI setup: pick where the AI runs, then the same wizard Settings uses. */
export function AiStep({ status }: { status: LlmSetupStatus }): ReactNode {
  const [choice, setChoice] = useState<AiChoice>('choose');

  if (status.configured) return <LlmSetupSection status={status} />;
  if (choice === 'choose') return <AiChoices onChoose={setChoice} />;

  return (
    <div className="onboarding__ai">
      <button type="button" className="btn-ghost" onClick={() => setChoice('choose')}>← Choose differently</button>
      {choice === 'openai' ? <OpenAiChecklist /> : <LocalAiNotes />}
      <LlmSetupSection status={status} initialKind={choice === 'local' ? 'local' : 'cloud'} />
    </div>
  );
}

function AiChoices({ onChoose }: { onChoose: (choice: AiChoice) => void }): ReactNode {
  return (
    <div className="onboarding__choices">
      <article className="card onboarding__choice onboarding__choice--recommended">
        <h3>OpenAI <span className="onboarding__badge">Recommended</span></h3>
        <p>The best coaching, and about ten minutes to set up once. Use your own key with a hard spending limit, and turn on data sharing to get free daily tokens (OpenAI may then use your chats to improve its models).</p>
        <button type="button" className="btn-primary" onClick={() => onChoose('openai')}>Set up OpenAI</button>
      </article>
      <article className="card onboarding__choice">
        <h3>On my computer</h3>
        <p>Free and private: LM Studio or Ollama runs the model on your machine. Needs a capable computer, and the tab has to stay open while you coach.</p>
        <button type="button" className="btn-secondary" onClick={() => onChoose('local')}>Use a local model</button>
      </article>
    </div>
  );
}

function LocalAiNotes(): ReactNode {
  return (
    <p className="settings-page__hint">
      Start your LM Studio or Ollama server first, with CORS enabled so this site may call it, then test the connection below. The{' '}
      <a href="/openai-key#local" target="_blank" rel="noopener noreferrer">local model guide</a> has the steps.
    </p>
  );
}
