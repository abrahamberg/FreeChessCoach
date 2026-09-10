import type { ReactNode } from 'react';
import { isImprovableQuality, type ClassifiedMoveDto } from '@freechesscoach/shared';
import { tacticReasonTexts } from './TacticReasonList.js';
import { useMoveAlternatives } from './useMoveAlternatives.js';

/** Tiers worth a "better was" coaching note — everything else (book, forced,
 * brilliant/great/best/excellent/good) had nothing meaningfully better to
 * play. The set itself lives in `@freechesscoach/shared` now: the reason
 * builder asks the same question when it decides whether a fault is worth
 * printing, and two copies of it drift. Re-exported here because
 * MoveExplorer and MoveNoteCard have always imported it from this module. */
export { isImprovableQuality };

/** `move.reasons` minus whichever of the two tactic sentences are present —
 * only when `excludeTacticText` asks for it (Game Review's MoveNoteCard,
 * which renders those two as TacticReasonList's own clickable items right
 * above this list, so leaving them in here too would show each one twice).
 * Every other MoveNote caller (MoveExplorer's coaching-session sidebar, no
 * TacticReasonList alongside it) keeps seeing the full `.reasons` text. */
function plainTextReasons(move: ClassifiedMoveDto, excludeTacticText: boolean): string[] {
  if (!move.reasons || move.reasons.length === 0) return [];
  if (!excludeTacticText) return move.reasons;
  const tacticTexts = tacticReasonTexts(move);
  if (tacticTexts.size === 0) return move.reasons;
  return move.reasons.filter((reason) => !tacticTexts.has(reason));
}

/** True once MoveNote/OpeningLabel below (or, with `excludeTacticText`,
 * TacticReasonList alongside them) would actually render something for this
 * move — lets a caller (MoveNoteCard) show its own "nothing to flag"
 * fallback instead of an empty card for a plain good/excellent move. */
export function hasMoveNoteText(move: ClassifiedMoveDto, excludeTacticText = false): boolean {
  if (move.quality === 'book') return Boolean(move.reasons?.[0]);
  if (excludeTacticText && (move.tacticOpportunity || move.tacticPrevention)) return true;
  if (plainTextReasons(move, excludeTacticText).length > 0) return true;
  return isImprovableQuality(move.quality) && move.bestLineSan.length > 0;
}

/** §11's closing paragraph: a book move's theory label is shown unconditionally
 * via `OpeningLabel` below, not gated behind the notes toggle — so `MoveNote`
 * skips it here to avoid rendering the same "Theory — …" line twice.
 * `excludeTacticText`: see `plainTextReasons` above. */
export function MoveNote({ move, excludeTacticText = false }: { move: ClassifiedMoveDto; excludeTacticText?: boolean }): ReactNode {
  if (move.quality === 'book') return null;
  const reasons = plainTextReasons(move, excludeTacticText);
  if (reasons.length > 0) {
    return (
      <ul className="move-explorer__note">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    );
  }
  if (isImprovableQuality(move.quality) && move.bestLineSan.length > 0) {
    return (
      <p className="move-explorer__note">
        {move.quality}: better was {move.bestLineSan.join(' ')}
      </p>
    );
  }
  return null;
}

/** §11's last trigger row: a book move always shows the opening name/ECO,
 * regardless of whether notes are toggled on — theory context is cheap to
 * show and is what tells a player they've left book. */
export function OpeningLabel({ move }: { move: ClassifiedMoveDto }): ReactNode {
  const theory = move.reasons?.[0];
  if (move.quality !== 'book' || !theory) return null;
  return <p className="move-explorer__opening-label">{theory}</p>;
}

export interface AlternativesPanelProps {
  move: ClassifiedMoveDto;
  /** Game Review's MoveNoteCard passes true: that page draws the best move
   * as a board arrow instead (useGameReviewPageData), so repeating the same
   * information as a full PV string here would be the exact "obvious text"
   * Daniel asked to drop in favor of the arrow. MoveExplorer's own callers
   * (the coaching session's desktop sidebar, which has no such arrow) leave
   * this at its default false. */
  hideBestLine?: boolean;
}

/** §11's closing paragraph: the engine's actual best line plus its two
 * win%-ranked (not raw-cp) runners-up, so a player can see what else was
 * playable without leaving the move list. The deep analysis pipeline only
 * stores one PV per ply, so `move.alternatives` is usually empty — when it
 * is, this lazily asks the lite engine for a couple of runner-up lines
 * (useMoveAlternatives) instead of leaving the panel bare. */
export function AlternativesPanel({ move, hideBestLine }: AlternativesPanelProps): ReactNode {
  const precomputed = (move.alternatives ?? []).slice(0, 2);
  // The played move already WAS the engine's top choice — "Best: <the move
  // just played>" repeats what the quality badge/headline already said.
  // Worth showing only when it names something the student didn't play, and
  // this panel then renders nothing at all — so it has to gate the fetch
  // below too, or every best-move ply the student steps past would spend an
  // uncached engine search on runners-up nobody ever sees.
  const hasSomethingToShow = Boolean(move.bestMoveSan) && move.bestMoveSan !== move.moveSan;
  const shouldFetch = hasSomethingToShow && precomputed.length === 0 && Boolean(move.fenBefore);
  const fetched = useMoveAlternatives(move.fenBefore, move.mover, move.bestMoveSan, shouldFetch);
  if (!hasSomethingToShow) return null;

  const pv = move.bestLinePvSan && move.bestLinePvSan.length > 0 ? move.bestLinePvSan.join(' ') : move.bestMoveSan;
  const runnersUp = precomputed.length > 0 ? precomputed : fetched.data;

  return (
    <div className="move-explorer__alternatives">
      {!hideBestLine && <p className="move-explorer__alternatives-best">Best: {pv}</p>}
      {shouldFetch && fetched.isLoading && <p className="move-explorer__notes-empty">Looking for other tries…</p>}
      {shouldFetch && fetched.isError && <p className="move-explorer__notes-empty">Couldn't load other tries — try again later.</p>}
      {runnersUp.length > 0 && (
        <ul className="move-explorer__alternatives-list">
          {runnersUp.map((alternative) => (
            <li key={alternative.san}>
              {alternative.san} ({alternative.winPct.toFixed(1)}%)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
