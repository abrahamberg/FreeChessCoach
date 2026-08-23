import { TTS_BACKENDS, type TtsBackend } from '@chess-coach/shared';
import { useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import './TtsSection.css';

export interface TtsProfilePatch {
  ttsEnabled?: boolean;
  ttsBackend?: TtsBackend;
}

export interface TtsSectionProps {
  enabled: boolean;
  backend: TtsBackend;
  onChange: (patch: TtsProfilePatch) => void;
}

const BACKEND_LABEL: Record<TtsBackend, string> = {
  openai: 'OpenAI voice (default)',
  browser: 'Browser voice — Beta (free, runs on your device)'
};

const BACKEND_WARNING: Record<TtsBackend, string> = {
  openai:
    'OpenAI voice streams speech from the cloud. It sounds better and starts almost instantly, but it spends ' +
    'AI credits every time a coach message is read aloud.',
  browser:
    'Browser voice runs entirely on your device — it never leaves your machine, and it’s free. Speed ' +
    'depends on your hardware and is generally much slower than the cloud option; keep this tab open while it ' +
    'speaks. It’s in beta.'
};

/** Coach voice (TTS): a master on/off switch, default off, plus which
 * backend to use once it's on. Turning the switch on, or picking a
 * different backend, is gated behind a confirmation dialog explaining that
 * choice's tradeoff (credits vs. local speed) — cancelling leaves `enabled`/
 * `backend` untouched, which is the "undo". Turning the switch off never
 * needs confirmation; there's no downside to applying it immediately. */
export function TtsSection({ enabled, backend, onChange }: TtsSectionProps): ReactNode {
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
    if (pending.backend !== backend) patch.ttsBackend = pending.backend;
    onChange(patch);
    setPending(null);
  }

  return (
    <div className="tts-section">
      <label className="tts-section__master">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => handleToggleEnabled(event.target.checked)}
        />
        Enable coach voice (text-to-speech)
      </label>

      {enabled && (
        <div className="tts-section__backends" role="radiogroup" aria-label="Coach voice backend">
          {TTS_BACKENDS.map((option) => (
            <label key={option} className="tts-section__backend-option">
              <input
                type="radio"
                name="tts-backend"
                checked={backend === option}
                onChange={() => handleSelectBackend(option)}
              />
              {BACKEND_LABEL[option]}
            </label>
          ))}
        </div>
      )}

      {pending && (
        <Modal
          title={pending.backend === 'openai' ? 'Use OpenAI voice?' : 'Use browser voice?'}
          onClose={() => setPending(null)}
        >
          <p>{BACKEND_WARNING[pending.backend]}</p>
          <div className="tts-section__confirm-actions">
            <button type="button" className="btn-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={confirmPending}>
              {pending.backend === 'openai' ? 'Use OpenAI voice' : 'Use browser voice (Beta)'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
