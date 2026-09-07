import type { ReactNode } from 'react';
import type { ClassifiedMoveDto, MoveQuality } from '@freechesscoach/shared';
import { useMoveAlternatives } from './useMoveAlternatives.js';

/** Tiers worth a "better was" coaching note — everything else (book, forced,
 * brilliant/great/best/excellent/good) had nothing meaningfully better to
 * play. Shared by MoveExplorer (desktop move list) and MoveNoteCard (mobile
 * Review's dominant note card) — one source of truth for what counts as a
 * note worth showing. */
const IMPROVABLE_QUALITIES: ReadonlySet<MoveQuality> = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

export function isImprovableQuality(quality: MoveQuality | undefined): boolean {
  return quality !== undefined && IMPROVABLE_QUALITIES.has(quality);
}

/** True once MoveNote/OpeningLabel below would actually render something for
 * this move — lets a caller (MoveNoteCard) show its own "nothing to flag"
 * fallback instead of an empty card for a plain good/excellent move. */
export function hasMoveNoteText(move: ClassifiedMoveDto): boolean {
  if (move.quality === 'book') return Boolean(move.reasons?.[0]);
  if (move.reasons && move.reasons.length > 0) return true;
  return isImprovableQuality(move.quality) && move.bestLineSan.length > 0;
}

/** §11's closing paragraph: a book move's theory label is shown unconditionally
 * via `OpeningLabel` below, not gated behind the notes toggle — so `MoveNote`
 * skips it here to avoid rendering the same "Theory — …" line twice. */
export function MoveNote({ move }: { move: ClassifiedMoveDto }): ReactNode {
  if (move.quality === 'book') return null;
  if (move.reasons && move.reasons.length > 0) {
    return (
      <ul className="move-explorer__note">
        {move.reasons.map((reason) => (
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

/** §11's closing paragraph: the engine's actual best line plus its two
 * win%-ranked (not raw-cp) runners-up, so a player can see what else was
 * playable without leaving the move list. The deep analysis pipeline only
 * stores one PV per ply, so `move.alternatives` is usually empty — when it
 * is, this lazily asks the lite engine for a couple of runner-up lines
 * (useMoveAlternatives) instead of leaving the panel bare. */
export function AlternativesPanel({ move }: { move: ClassifiedMoveDto }): ReactNode {
  const precomputed = (move.alternatives ?? []).slice(0, 2);
  const shouldFetch = precomputed.length === 0 && Boolean(move.bestMoveSan) && Boolean(move.fenBefore);
  const fetched = useMoveAlternatives(move.fenBefore, move.mover, move.bestMoveSan, shouldFetch);
  // The played move already WAS the engine's top choice — "Best: <the move
  // just played>" repeats what the quality badge/headline already said.
  // Worth showing only when it names something the student didn't play.
  if (!move.bestMoveSan || move.bestMoveSan === move.moveSan) return null;

  const pv = move.bestLinePvSan && move.bestLinePvSan.length > 0 ? move.bestLinePvSan.join(' ') : move.bestMoveSan;
  const runnersUp = precomputed.length > 0 ? precomputed : fetched.data;

  return (
    <div className="move-explorer__alternatives">
      <p className="move-explorer__alternatives-best">Best: {pv}</p>
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
