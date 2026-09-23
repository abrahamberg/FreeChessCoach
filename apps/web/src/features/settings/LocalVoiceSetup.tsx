import { useState, type ReactNode } from 'react';
import { synthesizeLocal } from '../../tts/local-tts-client.js';
import {
  DEFAULT_LOCAL_TTS_PORT,
  localTtsBaseUrl,
  parseLocalTtsPort,
  readLocalTtsPort,
  writeLocalTtsPort
} from '../../tts/local-tts-settings.js';

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok' } | { status: 'failed'; message: string };

const GUIDE_URL = '/guide#voice';

async function playTestVoice(baseUrl: string): Promise<void> {
  const audio = await synthesizeLocal(baseUrl, 'Voice server connected. Ready to coach.', 'bm_daniel');
  const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
  const player = new Audio(url);
  player.addEventListener('ended', () => URL.revokeObjectURL(url));
  await player.play();
}

/** Shown under the coach-voice options while "Local voice server" is
 * selected: a pointer to the one-time setup in the guide, a "Test voice"
 * button, and — collapsed, since almost nobody needs it — the port override. */
export function LocalVoiceSetup(): ReactNode {
  const [portText, setPortText] = useState(() => String(readLocalTtsPort()));
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const parsedPort = parseLocalTtsPort(portText);

  function handlePortChange(next: string): void {
    setPortText(next);
    setTest({ status: 'idle' });
    const port = parseLocalTtsPort(next);
    if (port !== null) writeLocalTtsPort(port);
  }

  // Leaving the field with something invalid puts back the port that is
  // actually saved, so what's shown is always what will be used.
  function handlePortBlur(): void {
    if (parsedPort === null) setPortText(String(readLocalTtsPort()));
  }

  async function handleTest(): Promise<void> {
    if (parsedPort === null) return;
    setTest({ status: 'testing' });
    try {
      await playTestVoice(localTtsBaseUrl(parsedPort));
      setTest({ status: 'ok' });
    } catch {
      setTest({
        status: 'failed',
        message: 'Couldn’t reach the voice server. Make sure it’s running (see the setup guide) and the port matches.'
      });
    }
  }

  return (
    <div className="local-voice">
      <p className="local-voice__intro">
        This needs a one-time setup on your computer (about 10 minutes, free).{' '}
        <a href={GUIDE_URL} target="_blank" rel="noreferrer">
          Open the setup guide
        </a>
        , then come back and press <strong>Test voice</strong>.
      </p>
      <div className="local-voice__test">
        <button
          type="button"
          className="btn-secondary"
          disabled={test.status === 'testing' || parsedPort === null}
          onClick={() => void handleTest()}
        >
          {test.status === 'testing' ? 'Testing…' : 'Test voice'}
        </button>
        {test.status === 'ok' && <span role="status">Working — you should have heard the coach.</span>}
        {test.status === 'failed' && (
          <span role="alert" className="local-voice__error">
            {test.message}
          </span>
        )}
      </div>

      <details className="local-voice__advanced">
        <summary>Advanced: use a different port</summary>
        <label className="local-voice__field">
          <span>Voice server port (default {DEFAULT_LOCAL_TTS_PORT})</span>
          <input
            type="text"
            inputMode="numeric"
            value={portText}
            aria-invalid={parsedPort === null}
            onChange={(event) => handlePortChange(event.target.value)}
            onBlur={handlePortBlur}
          />
        </label>
        {parsedPort === null && (
          <span role="alert" className="local-voice__error">
            Enter a number from 1 to 65535.
          </span>
        )}
        <p>
          Only change this if you started the voice server on another port because {DEFAULT_LOCAL_TTS_PORT} was already in use.
          The number here must match the one you started it with. The setup guide shows how to pick a different port.
        </p>
      </details>
    </div>
  );
}
