import type { ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import './AiSetupRequiredModal.css';

export interface AiSetupRequiredModalProps {
  onClose: () => void;
  onGoToSettings: () => void;
  /** Sends the student to the free, no-AI Game Report review instead —
   * omitted where there's no game to review yet (e.g. no gameId resolved). */
  onAnalyzeInstead?: () => void;
}

/** Shown instead of silently redirecting to Settings the moment a coaching
 * turn fails because the student has no AI setup saved at all (see
 * useSessionPageData's handleSetupRequired) — explains what's missing and
 * lets the student choose to go set it up, or fall back to the free
 * no-AI Analyze review, rather than yanking them off the session
 * unannounced. */
export function AiSetupRequiredModal({ onClose, onGoToSettings, onAnalyzeInstead }: AiSetupRequiredModalProps): ReactNode {
  return (
    <Modal title="AI setup needed" onClose={onClose}>
      <div className="ai-setup-required-modal">
        <p className="ai-setup-required-modal__description">
          Your coach needs an AI provider key to work. You can use any provider — add its key in
          Settings to turn AI features on.
        </p>
        <p className="ai-setup-required-modal__description">
          Don't want to set one up right now? Analyze still gives you move-by-move feedback on
          this game for free, no AI key needed.
        </p>
        <div className="ai-setup-required-modal__actions">
          <button type="button" className="btn-secondary" onClick={onAnalyzeInstead ?? onClose}>
            {onAnalyzeInstead ? 'Analyze without AI' : 'Not now'}
          </button>
          <button type="button" className="btn-primary" onClick={onGoToSettings}>
            Go to Settings
          </button>
        </div>
      </div>
    </Modal>
  );
}
