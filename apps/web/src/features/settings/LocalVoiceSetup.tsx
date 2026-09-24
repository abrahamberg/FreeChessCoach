import { useState, type ReactNode } from 'react';
import { LocalTtsHttpError, synthesizeLocal } from '../../tts/local-tts-client.js';
import {
  DEFAULT_LOCAL_TTS_URL,
  normalizeLocalTtsUrl,
  readLocalTtsUrl,
  writeLocalTtsUrl
} from '../../tts/local-tts-settings.js';

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok' } | { status: 'failed'; message: string };

const GUIDE_URL = '/guide#voice';

function describeFailure(error: unknown): string {
  if (error instanceof LocalTtsHttpError) return `The voice server answered with an error (${error.status}).`;
  return 'Couldn’t reach the voice server. Make sure it’s running (see the setup guide) and the address matches.';
}

async function playTestVoice(baseUrl: string): Promise<void> {
  const audio = await synthesizeLocal(baseUrl, 'Voice server connected. Ready to coach.', 'bm_daniel');
  const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
  const player = new Audio(url);
  player.addEventListener('ended', () => URL.revokeObjectURL(url));
  await player.play();
}

/** Shown under the coach-voice options while "Local voice server" is
 * selected: a pointer to the one-time setup in the guide, a "Test voice"
 * button, and — collapsed, since almost nobody needs it — the one address
 * field for a server that isn't on the default `localhost:8880`. */
export function LocalVoiceSetup(): ReactNode {
  const [addressText, setAddressText] = useState(readLocalTtsUrl);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const address = normalizeLocalTtsUrl(addressText);
  const invalid = addressText.trim() !== '' && address === null;
  // Empty means "go back to the default", which is always valid.
  const target = addressText.trim() === '' ? DEFAULT_LOCAL_TTS_URL : address;

  function handleAddressChange(next: string): void {
    setAddressText(next);
    setTest({ status: 'idle' });
  }

  // Saved when you leave the field (or press Test), not per keystroke: while
  // typing, half an address like "ftp" is a valid hostname and would be
  // stored. An unusable address puts back what is actually saved, so what's
  // shown is always what will be used; a usable one is shown cleaned up.
  function commitAddress(): void {
    if (addressText.trim() === '') {
      writeLocalTtsUrl(null);
      setAddressText(DEFAULT_LOCAL_TTS_URL);
    } else if (address !== null) {
      writeLocalTtsUrl(address);
      setAddressText(address);
    } else {
      setAddressText(readLocalTtsUrl());
    }
  }

  async function handleTest(): Promise<void> {
    if (target === null) return;
    commitAddress();
    setTest({ status: 'testing' });
    try {
      await playTestVoice(target);
      setTest({ status: 'ok' });
    } catch (error) {
      setTest({ status: 'failed', message: describeFailure(error) });
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
          disabled={test.status === 'testing' || target === null}
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
        <summary>Advanced: use a different address or port</summary>
        <label className="local-voice__field">
          <span>Voice server address</span>
          <input
            type="text"
            value={addressText}
            placeholder={DEFAULT_LOCAL_TTS_URL}
            spellCheck={false}
            aria-invalid={invalid}
            onChange={(event) => handleAddressChange(event.target.value)}
            onBlur={commitAddress}
          />
        </label>
        {invalid && (
          <span role="alert" className="local-voice__error">
            Enter an address like localhost:9000 or http://192.168.1.5:8880.
          </span>
        )}
        {target !== null && <p role="note">Using {target}</p>}
        <p>
          Leave this as it is unless you started the voice server on another port or another computer. A bare number
          such as <code>9000</code> means <code>localhost:9000</code>. With no port, <code>localhost</code> uses 8880 and any
          other computer uses port 80. Clear the field to go back to the default.
        </p>
      </details>
    </div>
  );
}
