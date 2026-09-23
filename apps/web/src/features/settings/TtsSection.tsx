import { TTS_BACKENDS, type TtsBackend } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import { LocalVoiceSetup } from './LocalVoiceSetup.js';
import '../../components/RadioCard.css';
import './TtsSection.css';

export interface TtsProfilePatch {
  ttsEnabled?: boolean;
  ttsBackend?: TtsBackend;
}

export interface TtsSectionProps {
  enabled: boolean;
  backend: TtsBackend;
  /** False when no OpenAI voice model is set up: the OpenAI option is
   * disabled and the browser voice is used instead. */
  openaiAvailable: boolean;
  onChange: (patch: TtsProfilePatch) => void;
}

const BACKEND_LABEL: Record<TtsBackend, string> = {
  openai: 'OpenAI voice (default)',
  browser: 'Browser voice — Slow, Beta (free, runs on your device)',
  local: 'Local voice server (free, fast, needs a small install)'
};

const BACKEND_CONFIRM_TITLE: Record<TtsBackend, string> = {
  openai: 'Use OpenAI voice?',
  browser: 'Use browser voice?',
  local: 'Use local voice server?'
};

const BACKEND_CONFIRM_BUTTON: Record<TtsBackend, string> = {
  openai: 'Use OpenAI voice',
  browser: 'Use browser voice (Beta)',
  local: 'Use local voice server'
};

const BACKEND_WARNING: Record<TtsBackend, string> = {
  openai:
    'OpenAI voice streams speech from the cloud using your own OpenAI API key. It sounds better and starts almost instantly, but it spends usage on your OpenAI account every time a coach message is read aloud.',
  browser:
    'Browser voice runs entirely on your device — it never leaves your machine, and it’s free. Speed ' +
    'depends on your hardware and is generally much slower than the cloud option; keep this tab open while it ' +
    'speaks. It’s in beta.',
  local:
    'The local voice server is a free voice program you run on your own computer, next to LM Studio. ' +
    'It sounds natural, starts quickly and costs nothing. Nothing is sent to us or to any cloud. ' +
    'It needs a one-time setup — after you confirm, the steps appear right below the voice options.'
};

/** Coach voice (TTS): a master on/off switch, default off, plus which
 * backend to use once it's on. Turning the switch on, or picking a
 * different backend, is gated behind a confirmation dialog explaining that
 * choice's tradeoff (your own OpenAI key's usage vs. local speed) — cancelling leaves `enabled`/
 * `backend` untouched, which is the "undo". Turning the switch off never
 * needs confirmation; there's no downside to applying it immediately. */
export function TtsSection({ enabled, backend: savedBackend, openaiAvailable, onChange }: TtsSectionProps): ReactNode {
  // A saved 'openai' choice (the DB default) is shown and acted on as
  // 'browser' while OpenAI isn't set up.
  const backend: TtsBackend = !openaiAvailable && savedBackend === 'openai' ? 'browser' : savedBackend;
  const [pending, setPending] = useState<{ enabled: boolean; backend: TtsBackend } | null>(null);

  function handleToggleEnabled(next: boolean): void {
    if (!next) {
      onChange({ ttsEnabled: false });
      return;
    }
    setPending({ enabled: true, backend });
  }

  function handleSelectBackend(next: TtsBackend): void {
    if (next === backend) return;
    setPending({ enabled: true, backend: next });
  }

  function confirmPending(): void {
    if (!pending) return;
    const patch: TtsProfilePatch = {};
    if (pending.enabled !== enabled) patch.ttsEnabled = pending.enabled;
    if (pending.backend !== savedBackend) patch.ttsBackend = pending.backend;
    onChange(patch);
    setPending(null);
  }

  return (
    <div className="tts-section">
      <label className="tts-section__master">
        <span>Enable coach voice (text-to-speech)</span>
        <input
          type="checkbox"
          className="toggle-switch"
          checked={enabled}
          onChange={(event) => handleToggleEnabled(event.target.checked)}
        />
      </label>

      {enabled && (
        <div className="tts-section__backends radio-card-group" role="radiogroup" aria-label="Coach voice backend">
          {TTS_BACKENDS.map((option) => (
            <label key={option} className="tts-section__backend-option radio-card">
              <input
                type="radio"
                name="tts-backend"
                checked={backend === option}
                disabled={option === 'openai' && !openaiAvailable}
                onChange={() => handleSelectBackend(option)}
              />
              {BACKEND_LABEL[option]}
              {option === 'openai' && !openaiAvailable && ' — set up an OpenAI voice model in AI setup to use this'}
            </label>
          ))}
        </div>
      )}

      {enabled && backend === 'local' && <LocalVoiceSetup />}

      {pending && (
        <Modal
          title={BACKEND_CONFIRM_TITLE[pending.backend]}
          onClose={() => setPending(null)}
        >
          <p>{BACKEND_WARNING[pending.backend]}</p>
          <div className="tts-section__confirm-actions">
            <button type="button" className="btn-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={confirmPending}>
              {BACKEND_CONFIRM_BUTTON[pending.backend]}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
