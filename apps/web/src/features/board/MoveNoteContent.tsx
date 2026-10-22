import type { ReactNode } from 'react';
import { betterWasText, plainReviewReasons, reviewMoveTexts, storyOf, type ReviewText } from '@freechesscoach/chess-analysis';
import { isImprovableQuality, type ClassifiedMoveDto } from '@freechesscoach/shared';
import { useMoveAlternatives } from './useMoveAlternatives.js';

/** Tiers worth a "better was" coaching note — everything else (book, forced,
 * brilliant/great/best/excellent/good) had nothing meaningfully better to
 * play. The set itself lives in `@freechesscoach/shared` now: the reason
 * builder asks the same question when it decides whether a fault is worth
 * printing, and two copies of it drift. Re-exported here because
 * MoveExplorer and MoveNoteCard have always imported it from this module. */
export { isImprovableQuality };

/** True once MoveNote/OpeningLabel below (or, with `excludeTacticText`,
 * TacticReasonList alongside them) would actually render something for this
 * move — lets a caller (MoveNoteCard) show its own "nothing to flag"
 * fallback instead of an empty card for a plain good/excellent move. */
export function hasMoveNoteText(move: ClassifiedMoveDto, excludeTacticText = false): boolean {
  if (move.quality === 'book') return Boolean(move.reasons?.[0]);
  if (storyOf(move)) return storyNoteTexts(move, excludeTacticText).length > 0;
  if (excludeTacticText && (move.tacticAllowed || move.tacticOpportunity || move.tacticPrevention)) return true;
  return plainReviewReasons(move, excludeTacticText).length > 0 || betterWasText(move, excludeTacticText) !== null;
}

const RUNNERS_UP = 2;

/** A move's notes. A book move's first note is its theory label, shown
 * unconditionally via `OpeningLabel` below, not gated behind the notes
 * toggle — so `MoveNote` gives only what follows it (what the move does),
 * to avoid rendering the same "Theory — …" line twice.
 * `excludeTacticText`: see `plainReviewReasons` (chess-analysis). */
export function MoveNote({ move, excludeTacticText = false }: { move: ClassifiedMoveDto; excludeTacticText?: boolean }): ReactNode {
  if (storyOf(move)) return <StoryNote texts={storyNoteTexts(move, excludeTacticText)} />;
  const all = plainReviewReasons(move, excludeTacticText);
  const reasons = move.quality === 'book' ? all.filter((reason) => reason !== move.reasons?.[0]) : all;
  if (reasons.length > 0) {
    return (
      <ul className="move-explorer__note">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    );
  }
  const better = betterWasText(move, excludeTacticText);
  return better ? <p className="move-explorer__note">{better}</p> : null;
}

const CARD_KINDS: ReadonlySet<ReviewText['kind']> = new Set(['allowed', 'opportunity', 'prevention']);

/** The story's sentences the note shows (`reviewMoveTexts`): the theory
 * line is `OpeningLabel`'s, and with `excludeTacticText` the cards are
 * `TacticReasonList`'s. */
function storyNoteTexts(move: ClassifiedMoveDto, excludeTacticText: boolean): ReviewText[] {
  return reviewMoveTexts(move).filter((text) => text.kind !== 'opening' && !(excludeTacticText && CARD_KINDS.has(text.kind)));
}

/** Under "more", by what they are about. */
const MORE_SECTIONS: { title: string; kinds: ReadonlySet<ReviewText['kind']> }[] = [
  { title: 'What the move does', kinds: new Set(['reason', 'idea']) },
  { title: 'Better was', kinds: new Set(['better']) },
  { title: 'Other moves the engine considered', kinds: new Set(['alternative']) }
];

/** The note: what matters about the move, then the rest of its story under
 * "More about this move" (`docs/move-story.md`). */
function StoryNote({ texts }: { texts: ReviewText[] }): ReactNode {
  const shown = texts.filter((text) => !text.more);
  const more = texts.filter((text) => text.more);
  if (texts.length === 0) return null;
  return (
    <>
      {shown.length > 0 && (
        <ul className="move-explorer__note">
          {shown.map((text) => (
            <li key={`${text.kind}:${text.text}`}>{text.kind === 'better' ? `Better was ${text.text}` : text.text}</li>
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <details className="move-explorer__more">
          <summary className="move-explorer__notes-summary">More about this move</summary>
          {MORE_SECTIONS.map(({ title, kinds }) => {
            const section = more.filter((text) => kinds.has(text.kind));
            return section.length > 0 ? (
              <section key={title} className="move-explorer__more-section">
                <h4 className="move-explorer__more-title">{title}</h4>
                <ul className="move-explorer__note">
                  {section.map((text) => (
                    <li key={`${text.kind}:${text.text}`}>{text.text}</li>
                  ))}
                </ul>
              </section>
            ) : null;
          })}
        </details>
      )}
    </>
  );
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
 * playable without leaving the move list. Game review stores three lines a
 * position (`REVIEW_MULTI_PV`), so `move.alternatives` holds two
 * runners-up — with fewer (a short game's mate, older evals), this lazily asks the lite engine for a
 * couple of runner-up lines (useMoveAlternatives) for the one move on show. */
export function AlternativesPanel({ move, hideBestLine }: AlternativesPanelProps): ReactNode {
  const precomputed = (move.alternatives ?? []).slice(0, RUNNERS_UP);
  // The played move already WAS the engine's top choice — "Best: <the move
  // just played>" repeats what the quality badge/headline already said.
  // Worth showing only when it names something the student didn't play, and
  // this panel then renders nothing at all — so it has to gate the fetch
  // below too, or every best-move ply the student steps past would spend an
  // uncached engine search on runners-up nobody ever sees.
  // A move with a story says the engine's moves itself, each with what it does (`StoryNote`).
  const hasSomethingToShow = Boolean(move.bestMoveSan) && move.bestMoveSan !== move.moveSan && !storyOf(move);
  const shouldFetch = hasSomethingToShow && precomputed.length < RUNNERS_UP && Boolean(move.fenBefore);
  const fetched = useMoveAlternatives(move.fenBefore, move.mover, move.bestMoveSan, shouldFetch);
  if (!hasSomethingToShow) return null;

  const pv = move.bestLinePvSan && move.bestLinePvSan.length > 0 ? move.bestLinePvSan.join(' ') : move.bestMoveSan;
  const runnersUp = precomputed.length >= RUNNERS_UP || fetched.data.length === 0 ? precomputed : fetched.data;

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
