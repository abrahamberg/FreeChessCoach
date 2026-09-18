import type { ReactNode } from 'react';
import { LightbulbIcon, UndoIcon } from '../../components/Icon.js';
import { ExplorePanel } from './ExplorePanel.js';
import type { ExploreFeedbackStatus } from './useExploreFeedback.js';
import type { UseHintMovesResult } from './useHintMoves.js';
import './BoardActionBar.css';

export interface BoardActionBarProps {
  isExploring: boolean;
  onOpenExplore: () => void;
  onCloseExplore: () => void;
  exploreStatus: ExploreFeedbackStatus;
  exploreEvaluation: string | null;
  /** Omitted entirely where a real move can't be self-undone (analyze mode,
   * puzzle practice — see each caller's own doc comment for why). */
  onUndo?: () => void;
  undoDisabled?: boolean;
  /** Omitted entirely where a Hint doesn't make sense (analyze mode, which
   * has no move to hint at). */
  hint?: UseHintMovesResult;
}

/** design ask: one bar (eye/Explore toggle, Undo, Hint) shared by every
 * board that plays out a live position — "play with coach", Play vs Bot,
 * and puzzle practice — instead of each page growing its own bespoke
 * subset. Undo/Hint are each optional (omitted where they don't apply — see
 * their own doc comments) so this stays the single component for all three
 * rather than three near-identical copies. No `< >` step buttons here: that
 * navigation already lives in MoveExplorer/MoveNavStrip, and duplicating it
 * here was the exact redundancy this bar replaces. */
export function BoardActionBar({
  isExploring,
  onOpenExplore,
  onCloseExplore,
  exploreStatus,
  exploreEvaluation,
  onUndo,
  undoDisabled,
  hint
}: BoardActionBarProps): ReactNode {
  return (
    <div className="board-action-bar">
      <ExplorePanel isOpen={isExploring} onOpen={onOpenExplore} onClose={onCloseExplore} status={exploreStatus} evaluation={exploreEvaluation} />
      {onUndo && (
        <button type="button" className="board-action-bar__undo" onClick={onUndo} disabled={undoDisabled}>
          <UndoIcon width={14} height={14} />
          Undo
        </button>
      )}
      {hint && (
        <button
          type="button"
          className={`board-action-bar__hint${hint.isLoading ? ' board-action-bar__hint--loading' : ''}`}
          onClick={hint.handleClick}
          aria-pressed={hint.stage > 0}
        >
          <LightbulbIcon width={14} height={14} />
          Hint
        </button>
      )}
      {/* Ditched the descriptive text bubble (design ask) — the highlighted
          piece(s) and, on the second click, the arrow(s) to their
          destination speak for themselves for a sighted student. This stays
          visually hidden, but must still say what the hint actually IS (not
          just loading/error) — the color highlights/arrows are the only
          place that information lives otherwise, and a screen reader has no
          way to read an arrow's color or a square's fill. */}
      {hint && hint.stage > 0 && (
        <p className="visually-hidden" role="status">
          {hint.error
            ? "Couldn't get a suggestion — try again."
            : hint.isLoading
              ? 'Getting a hint…'
              : hint.topMoves.length > 0
                ? `Top moves: ${hint.topMoves.map((move) => move.san).join(', ')}`
                : 'No moves to suggest.'}
        </p>
      )}
    </div>
  );
}
