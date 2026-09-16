import { useEffect, useState, type ReactNode } from 'react';
import { CloseIcon, EyeIcon } from '../../components/Icon.js';
import type { UseWasmEngineResult } from '../../hooks/useWasmEngine.js';
import type { BoardMode } from '../session/useSessionBoardState.js';
import './ExplorePanel.css';

export interface ExplorePanelProps {
  fen: string;
  /** Leaving peek mode any other way (the peek pill's "back to coach", a new
   * coach show_position) must collapse this panel too — otherwise its pill
   * is stuck on screen even once the coach is watching again. */
  mode: BoardMode;
  onEnterPeekMode: () => void;
  /** Fired by the pill's own close icon — the small, explicit "I'm done
   * exploring" control this panel now owns, alongside the pre-existing peek
   * pill elsewhere in the board column that reaches the same exit. */
  onExitPeekMode: () => void;
  engine: UseWasmEngineResult;
}

/** design.md §5.6: a small icon, not a full-width labeled button — tapping
 * it enters peek mode and runs the in-browser engine; tapping the pill's own
 * close icon leaves it again. Word-based evals only — never a number, never
 * sent to the server. Presentational: the hook lives in SessionPage
 * (AGENTS.md rule 7). */
export function ExplorePanel({ fen, mode, onEnterPeekMode, onExitPeekMode, engine }: ExplorePanelProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (mode !== 'peek') setIsOpen(false);
  }, [mode]);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="explore-panel-toggle"
        aria-label="Explore on your own"
        title="Explore on your own — your own private analysis, off the record"
        onClick={() => {
          setIsOpen(true);
          engine.analyze(fen);
          onEnterPeekMode();
        }}
      >
        <EyeIcon width={16} height={16} />
      </button>
    );
  }

  return (
    <p className="explore-panel-pill" title="Your private exploration — the coach isn't watching">
      <EyeIcon width={14} height={14} />
      {engine.evaluation ?? 'thinking…'}
      <button type="button" aria-label="Stop exploring" onClick={onExitPeekMode}>
        <CloseIcon width={12} height={12} />
      </button>
    </p>
  );
}
