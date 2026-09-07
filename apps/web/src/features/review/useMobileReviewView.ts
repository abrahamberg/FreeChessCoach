import { useCallback, useState } from 'react';

export type ReviewView = 'board' | 'notes';

/** Deliberately not keyed by game id, same reasoning as
 * useMobileSessionView's STORAGE_KEY: this is a standing preference about how
 * the student likes to review, not about one game. A distinct key from the
 * session view's — the two switches are independent (a student could default
 * to Coach in a live session but Board in Review, or vice versa). */
const STORAGE_KEY = 'freechesscoach:review-view';

export interface UseMobileReviewViewResult {
  view: ReviewView;
  showBoard: () => void;
  showNotes: () => void;
  select: (view: ReviewView) => void;
}

function readStoredView(): ReviewView {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'board' ? 'board' : 'notes';
  } catch {
    // Safari private mode throws on localStorage access.
    return 'notes';
  }
}

function storeView(view: ReviewView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Preference is a nicety — never let it break the switch itself.
  }
}

/** Which of the two mobile Game Review panels is showing, remembered across
 * games. Defaults to Notes: GameReviewPage's own doc comment calls the notes
 * the thing a mobile Review page has no chat to convey otherwise, so that's
 * what a first-time viewer should land on rather than the board — the same
 * "start on the content, not the board" default useMobileSessionView already
 * uses for the coaching session's Coach panel. */
export function useMobileReviewView(): UseMobileReviewViewResult {
  const [view, setView] = useState<ReviewView>(readStoredView);

  const select = useCallback((next: ReviewView) => {
    setView(next);
    storeView(next);
  }, []);

  const showBoard = useCallback(() => select('board'), [select]);
  const showNotes = useCallback(() => select('notes'), [select]);

  return { view, showBoard, showNotes, select };
}
