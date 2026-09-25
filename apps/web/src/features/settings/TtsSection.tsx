import type { CoachPersona, TtsBackend } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import { effectiveTtsBackend } from '../../tts/effective-tts-backend.js';
import { isNativeSpeechSupported } from '../../tts/native-speech.js';
import { useVoicePreview } from '../../tts/useVoicePreview.js';
import { coachPreviewLine } from '../onboarding/coach-lines.js';
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
  /** Whose voice "Test voice" plays: the coach picked above. */
  persona: CoachPersona;
}

/** Device voice is second on purpose: it is what a person without an OpenAI
 * voice model gets, and the free option worth trying first. */
const BACKEND_ORDER: readonly TtsBackend[] = ['openai', 'native', 'browser', 'local'];

const BACKEND_TITLE: Record<TtsBackend, string> = {
  openai: 'OpenAI voice',
  native: 'Device voice (free, instant)',
  browser: 'Browser voice (free, slow, beta)',
  local: 'Local voice server (free, fast, needs a small install)'
};

/** What each option is, what it costs, and the catch, in plain words. */
const BACKEND_DESCRIPTION: Record<TtsBackend, string> = {
  openai:
    'The most natural voice, and it starts almost at once. It uses your own OpenAI key, so every message read aloud spends a little of your OpenAI credit. Needs a voice model in your AI setup.',
  native:
    'The voice already built into your phone or Chrome. Free, instant, and nothing leaves your device. It sounds more robotic than the others, and which voices you get depends on your device.',
  browser:
    'A voice model that downloads once and then runs inside this tab. Free and private, but slow on most computers, and the tab has to stay open while it speaks.',
  local:
    'A free voice program you install on your own computer, next to LM Studio. Natural and fast, and nothing goes to any cloud, but it needs about ten minutes of setup once.'
};

const TEST_FAILURE: Record<TtsBackend, string> = {
  openai: 'Couldn’t play. Unlock your AI setup and try again.',
  native: 'Couldn’t play on this device.',
  browser: 'Couldn’t play. The voice model may still be downloading, try again in a moment.',
  local: 'Couldn’t reach the voice server.'
};

const BACKEND_CONFIRM_TITLE: Record<TtsBackend, string> = {
  openai: 'Use OpenAI voice?',
  browser: 'Use browser voice?',
  local: 'Use local voice server?',
  native: 'Use device voice?'
};

const BACKEND_CONFIRM_BUTTON: Record<TtsBackend, string> = {
  openai: 'Use OpenAI voice',
  browser: 'Use browser voice (Beta)',
  local: 'Use local voice server',
  native: 'Use device voice'
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
    'It needs a one-time setup — after you confirm, the steps appear right below the voice options.',
  native:
    'Device voice uses the text-to-speech built into your phone or browser (mobile browsers and desktop Chrome). ' +
    'It’s free, starts instantly and nothing leaves your device. Quality and available voices depend on your ' +
    'device, and it’s usually more robotic than the other options.'
};

/** Coach voice (TTS): a master on/off switch, default off, plus which
 * backend to use once it's on. Turning the switch on, or picking a
 * different backend, is gated behind a confirmation dialog explaining that
 * choice's tradeoff (your own OpenAI key's usage vs. local speed) — cancelling leaves `enabled`/
 * `backend` untouched, which is the "undo". Turning the switch off never
 * needs confirmation; there's no downside to applying it immediately. */
export function TtsSection({ enabled, backend: savedBackend, openaiAvailable, onChange, persona }: TtsSectionProps): ReactNode {
  // A saved 'openai' choice (the DB default) is shown and acted on as the
  // device voice while OpenAI isn't set up (see effectiveTtsBackend).
  const backend = effectiveTtsBackend(savedBackend, openaiAvailable);
  const nativeSupported = isNativeSpeechSupported();
  const [pending, setPending] = useState<{ enabled: boolean; backend: TtsBackend } | null>(null);
  const preview = useVoicePreview();
  const testKey = `${backend}:${persona}`;
  const testing = preview.loadingKey === testKey;
  const testPlaying = preview.playingKey === testKey;

  function handleToggleEnabled(next: boolean): void {
    if (!next) {
      onChange({ ttsEnabled: false });
      return;
    }
    setPending({ enabled: true, backend });
  }

  function handleSelectBackend(next: TtsBackend): void {
    if (enabled && next === backend) return;
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

      {!enabled && <p className="settings-page__hint">Voice is off. Turn the switch on to have the coach read aloud with the option ticked below.</p>}

      <div className="tts-section__backends radio-card-group" role="radiogroup" aria-label="Coach voice backend">
        {BACKEND_ORDER.map((option) => (
          <label key={option} className="tts-section__backend-option radio-card">
            <input
              type="radio"
              name="tts-backend"
              checked={backend === option}
              disabled={(option === 'openai' && !openaiAvailable) || (option === 'native' && !nativeSupported)}
              onChange={() => handleSelectBackend(option)}
            />
            <span className="tts-section__backend-text">
              <strong>{BACKEND_TITLE[option]}</strong>
              <span className="tts-section__backend-description">{BACKEND_DESCRIPTION[option]}</span>
              {option === 'openai' && !openaiAvailable && (
                <em className="tts-section__backend-note">Not available: set up an OpenAI voice model in AI setup to use this.</em>
              )}
              {option === 'native' && !nativeSupported && (
                <em className="tts-section__backend-note">Not available: this browser has no built-in voice.</em>
              )}
            </span>
          </label>
        ))}
      </div>

      {enabled && backend === 'local' ? (
        <LocalVoiceSetup persona={persona} />
      ) : (
        <div className="tts-section__test">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => preview.toggle(testKey, { persona, backend, text: coachPreviewLine(persona) })}
          >
            {testing ? (backend === 'browser' ? 'Loading voice…' : 'Loading…') : testPlaying ? 'Stop' : 'Test voice'}
          </button>
          {preview.failedKey === testKey && (
            <span role="alert" className="local-voice__error">
              {TEST_FAILURE[backend]}
            </span>
          )}
        </div>
      )}

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
