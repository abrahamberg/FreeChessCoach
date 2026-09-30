import type { ReactNode } from 'react';
import { BookIcon, LightbulbIcon } from '../../components/Icon.js';
import { Modal } from '../../components/Modal.js';

export interface StartOverDialogProps {
  onWithAi: () => void;
  onTemplate: () => void;
  onClose: () => void;
  /** Unsaved edits are saved first; say so. */
  dirty: boolean;
}

/** Phase 90: one reset instead of "Write with AI" and "Build without AI"
 * side by side, since both replace every episode. */
export function StartOverDialog({ onWithAi, onTemplate, onClose, dirty }: StartOverDialogProps): ReactNode {
  return (
    <Modal title="Start over" onClose={onClose}>
      <div className="start-over">
        <p className="meta">
          Both replace every chapter and episode. Your title, promise, coach and level stay.{dirty ? ' Your unsaved changes are saved first.' : ''}
        </p>
        <button type="button" className="start-over__choice" onClick={onWithAi}>
          <span className="start-over__icon" aria-hidden="true">
            <LightbulbIcon width={20} height={20} />
          </span>
          <span>
            <strong>Write it again with AI</strong>
            <span className="meta">Plans the episodes and writes every move in the coach’s voice, from the engine’s facts.</span>
          </span>
        </button>
        <button type="button" className="start-over__choice" onClick={onTemplate}>
          <span className="start-over__icon" aria-hidden="true">
            <BookIcon width={20} height={20} />
          </span>
          <span>
            <strong>Start from the template (no AI)</strong>
            <span className="meta">The kind’s episodes with lines filled from the engine’s facts, for you to write over.</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}
