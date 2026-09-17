import type { ReactNode } from 'react';
import { CloseIcon, EyeIcon } from '../../components/Icon.js';
import type { ExploreFeedbackStatus } from './useExploreFeedback.js';
import './ExplorePanel.css';

export interface ExplorePanelProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  status: ExploreFeedbackStatus;
  /** Word-based only, never a number — see useExploreFeedback/eval-words.ts. */
  evaluation: string | null;
}

/** design.md §5.6: a small icon, not a full-width labeled button — tapping
 * it enters peek mode and starts the engine pipeline's feedback loop
 * (useExploreFeedback, driven by the parent); tapping the pill's own close
 * icon leaves it again. Word-based evals only — never a number. Fully
 * presentational (AGENTS.md rule 7): `isOpen`/the feedback itself are owned
 * by the caller (SessionBoardColumn), which also draws the up-to-3 best-reply
 * arrows and the coach-box note (ExploreNoteCard) this same feedback feeds. */
export function ExplorePanel({ isOpen, onOpen, onClose, status, evaluation }: ExplorePanelProps): ReactNode {
  if (!isOpen) {
    return (
      <button
        type="button"
        className="explore-panel-toggle"
        aria-label="Explore on your own"
        title="Explore on your own — your own private analysis, off the record"
        onClick={onOpen}
      >
        <EyeIcon width={16} height={16} />
      </button>
    );
  }

  return (
    <p className="explore-panel-pill" title="Your private exploration — the coach isn't watching">
      <EyeIcon width={14} height={14} />
      {status === 'error' ? "Couldn't reach the engine" : (evaluation ?? 'thinking…')}
      <button type="button" aria-label="Stop exploring" onClick={onClose}>
        <CloseIcon width={12} height={12} />
      </button>
    </p>
  );
}
