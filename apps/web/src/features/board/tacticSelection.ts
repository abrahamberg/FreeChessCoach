import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { BoardArrow, BoardHighlight } from './CoachBoard.js';

/** Which of a move's tactic sentences (if any) currently has its board
 * arrows showing — `'all'` is the "ready-made arrows" toggle (every one at
 * once), `null` is nothing selected. Only one of these is ever active:
 * picking a new one replaces whatever was showing, per Daniel's call
 * ("click on other sentence to show other one"). */
export type TacticSelectionKey = 'allowed' | 'opportunity' | 'prevention' | 'all' | null;

/** Clicking the sentence/toggle that's already active turns it off — the
 * click-again-to-deselect half of the interaction (the note card's own ×
 * button is the other, explicit half). */
export function toggleTacticSelection(current: TacticSelectionKey, key: Exclude<TacticSelectionKey, null>): TacticSelectionKey {
  return current === key ? null : key;
}

const GOOD_ARROW_COLOR = 'var(--tactic-good)';
const BAD_ARROW_COLOR = 'var(--tactic-bad)';
const GOOD_FILL = 'var(--tactic-good-fill)';
const BAD_FILL = 'var(--tactic-bad-fill)';

interface TacticOverlay {
  arrows: BoardArrow[];
  highlights: BoardHighlight[];
}

const EMPTY_OVERLAY: TacticOverlay = { arrows: [], highlights: [] };

/** The board arrows/highlights for `move`'s tactic sentence(s) currently
 * selected — green for the good outcome (found the tactic / defused the
 * threat), red for the bad one (missed it / left it in play). Resolves to
 * nothing when `key` is null, the move has no tactic data, or that motif
 * claim has no geometry to draw — a claim carries its own arrows, so an
 * empty overlay means the motif genuinely has none. */
export function tacticSelectionOverlay(move: ClassifiedMoveDto | undefined, key: TacticSelectionKey): TacticOverlay {
  if (!move || !key) return EMPTY_OVERLAY;

  const parts: TacticOverlay[] = [];
  // Always red: what a move handed over is never the reader's good news, and
  // the geometry is the opponent's reply drawn on the board this move made.
  if ((key === 'allowed' || key === 'all') && move.tacticAllowed?.visual) {
    parts.push(colorOverlay(move.tacticAllowed.visual, false));
  }
  if ((key === 'opportunity' || key === 'all') && move.tacticOpportunity?.visual) {
    parts.push(colorOverlay(move.tacticOpportunity.visual, move.tacticOpportunity.found));
  }
  if ((key === 'prevention' || key === 'all') && move.tacticPrevention?.visual) {
    parts.push(colorOverlay(move.tacticPrevention.visual, move.tacticPrevention.prevented));
  }
  if (parts.length === 0) return EMPTY_OVERLAY;

  return {
    arrows: parts.flatMap((part) => part.arrows),
    highlights: parts.flatMap((part) => part.highlights)
  };
}

function colorOverlay(visual: { arrows: { from: string; to: string }[]; highlights: string[] }, good: boolean): TacticOverlay {
  const arrowColor = good ? GOOD_ARROW_COLOR : BAD_ARROW_COLOR;
  const fill = good ? GOOD_FILL : BAD_FILL;
  return {
    arrows: visual.arrows.map((arrow) => ({ ...arrow, color: arrowColor })),
    highlights: visual.highlights.map((square) => ({ square, color: fill }))
  };
}

/** True once any tactic sentence has arrows worth drawing — governs
 * whether the "show tactic arrows" (ready-made-arrows) toggle even
 * appears, and whether a given sentence is clickable at all. */
export function hasTacticVisual(move: ClassifiedMoveDto | undefined): boolean {
  return Boolean(move?.tacticAllowed?.visual || move?.tacticOpportunity?.visual || move?.tacticPrevention?.visual);
}
