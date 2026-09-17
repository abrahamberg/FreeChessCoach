import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import './UnlockPhraseModal.css';

export interface UnlockPhraseModalProps {
  onClose: () => void;
  onUnlock: (unlockPhrase: string) => void;
  /** Fires once, shortly after a successful unlock — the caller closes the
   * modal here and (in a coaching session) retries whatever turn failed. */
  onUnlocked: () => void;
  isPending: boolean;
  isSuccess: boolean;
  errorMessage?: string;
  /** A coaching session explains *why* the popup appeared; Settings leaves
   * it generic. */
  description?: string;
}

const SUCCESS_CLOSE_DELAY_MS = 800;

/** The one popup every locked-AI moment needs: the unlock phrase, submitted,
 * with immediate checking/correct/wrong feedback — reused by both Settings
 * (replacing the old always-inline unlock form) and a coaching session the
 * instant a turn fails because the AI is locked. */
export function UnlockPhraseModal({
  onClose,
  onUnlock,
  onUnlocked,
  isPending,
  isSuccess,
  errorMessage,
  description
}: UnlockPhraseModalProps): ReactNode {
  const [phrase, setPhrase] = useState('');

  // Hands off to the caller once the "Unlocked" confirmation has had a
  // moment to register, rather than snapping the popup shut the instant the
  // request resolves.
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(onUnlocked, SUCCESS_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, onUnlocked]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (isPending || isSuccess || phrase.length === 0) return;
    onUnlock(phrase);
  }

  return (
    <Modal title="Unlock your AI setup" onClose={onClose}>
      <div className="unlock-phrase-modal">
        <p className="unlock-phrase-modal__description">
          {description ?? 'Enter your unlock phrase to use your saved AI setup.'}
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="unlock-phrase-modal-input">Unlock phrase</label>
          <input
            id="unlock-phrase-modal-input"
            type="password"
            autoFocus
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            disabled={isPending || isSuccess}
          />
          <div className="unlock-phrase-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isPending || isSuccess || phrase.length === 0}>
              {isPending ? 'Checking…' : isSuccess ? 'Unlocked ✓' : 'Unlock'}
            </button>
          </div>
        </form>
        {isSuccess && (
          <p className="unlock-phrase-modal__feedback unlock-phrase-modal__feedback--success" role="status">
            AI setup unlocked.
          </p>
        )}
        {!isSuccess && errorMessage && (
          <p className="unlock-phrase-modal__feedback unlock-phrase-modal__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </Modal>
  );
}
