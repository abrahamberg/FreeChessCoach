import type { ReactNode } from 'react';

/** Where to send someone who has no AI key yet. The pages are the public,
 * logged-out ones (apps/web/public), opened in a new tab so a half-filled
 * setup form is not lost. */
export function AiSetupHelp(): ReactNode {
  return (
    <p className="settings-page__hint">
      No key yet? The welcome guide covers this too, or follow the{' '}
      <a href="/openai-key" target="_blank" rel="noopener noreferrer">step-by-step guide to getting one</a>
      , which also covers{' '}
      <a href="/openai-key#free" target="_blank" rel="noopener noreferrer">free usage and what it costs in privacy</a>
      . <a href="/keys" target="_blank" rel="noopener noreferrer">How we handle your key</a> explains what we do and cannot promise.
    </p>
  );
}
