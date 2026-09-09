import type { MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import type { PreviousMove } from './tactic-detectors/context.js';
import type { TacticDetector } from './tactic-detectors/types.js';

/** The motifs a registry detector can actually report. Narrower than
 * `TacticMotifType`: `checkmate`/`brilliantSacrifice`/`other` are answered by
 * `classifyTacticMotif`'s own pre-checks and post-loop fallback, never by a
 * detector, so they can appear as a case's `targetMotif` but never in its
 * detector sets. */
export type DetectorMotif = TacticDetector['type'];

/** Motif names that arrived with phase D of `docs/tactics-rework.md`. Kept
 * as its own alias because these are the names the cases were written
 * against before the detectors existed. */
export type NewMotif = 'breaksPin' | 'gainsTempo' | 'discoveredCheck';

export type DefectKind =
  /** A motif is claimed where there is no tactic at all. */
  | 'phantom'
  /** A real idea the vocabulary has no word for, so nothing is shown. */
  | 'missing'
  /** A real tactic named as the wrong motif. */
  | 'mislabelled'
  /** The headline is right but a junk claim fires alongside it. */
  | 'noisy-co-fire'
  /** The headline is right and the sentence throws away what it won. */
  | 'lost-detail';

/**
 * One reported Game Review card, replayed as a fixture — see
 * `tactic-review-cases.ts` for the cases themselves and
 * `docs/tactics-rework.md` §1 for where each came from.
 *
 * `today*` is what the pipeline produces right now, wrong answers included;
 * `target*` is what it must produce once phases 0–D land. The two disagree for
 * every case that is still broken, and that disagreement is the debt list
 * `tactic-review-cases.test.ts` enforces.
 */
export interface TacticReviewCase {
  /** Stable id — quote it in commit messages and the plan doc. */
  id: string;
  fenBefore: string;
  moveSan: string;
  mover: 'white' | 'black';
  /** Whose review this is. The card is written to this side's player, so it
   * decides "You" vs "They" — see docs/tactics-rework.md §3 rule 3. The test
   * asserts every `targetSentence` opens with the right pronoun for it. */
  userColor: 'white' | 'black';
  /** The move's own classification, which `classifyTacticMotif` consults
   * before it runs any detector: `'brilliant'` short-circuits to
   * `brilliantSacrifice`. TR-07/TR-08 are the same move either side of that
   * branch. */
  quality: MoveQuality;
  /** The opponent's move immediately before this one, where the case comes
   * from a real game and the move list gives it. The recapture gate reads
   * it, and TR-04/TR-05 are only distinguishable from a windfall capture
   * with it — see `tactic-detectors/context.ts`. `undefined` for the
   * positions read off a board, where there is no move list to consult. */
  previous?: PreviousMove | null;
  /** `isTacticalPosition` as the shipped pipeline computed it here. It only
   * changes the outcome for a move no detector matches: `true` yields the
   * `'other'` catch-all, `false` yields no card at all. */
  isTacticalPosition: boolean;
  /** The single motif the card shows today. */
  todayMotif: TacticMotifType | null;
  /** Every registry detector that fires, not just the first match — the
   * multi-label view phase C exposes. A motif in here but not in
   * `targetDetectors` is a claim that must stop being made. */
  todayDetectors: readonly DetectorMotif[];
  /** `null` when no card is shown — the review UI's "Nothing to flag" state. */
  todaySentence: string | null;
  targetMotif: TacticMotifType | NewMotif | null;
  targetDetectors: readonly (DetectorMotif | NewMotif)[];
  /** The intended prose, for reference — the exact wording is a product
   * decision, so only its opening pronoun is asserted. */
  targetSentence: string | null;
  /** Short name for what is wrong today, or `null` when the case is already
   * correct. The test cross-checks this against `isTacticReviewCaseUnfixed`,
   * so it cannot go stale. */
  defect: DefectKind | null;
  note: string;
}

/** Whether the shipped pipeline still disagrees with this case's target — in
 * the headline motif, or in which claims it makes alongside it. */
export function isTacticReviewCaseUnfixed(reviewCase: TacticReviewCase): boolean {
  if (reviewCase.todayMotif !== reviewCase.targetMotif) return true;
  return !sameMotifSet(reviewCase.todayDetectors, reviewCase.targetDetectors);
}

/** Order-insensitive comparison that still counts duplicates, unlike a
 * length-plus-`includes` check. */
function sameMotifSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((motif, index) => motif === sortedRight[index]);
}

/** "You" when the card's reader played the move, "They" otherwise. */
export function expectedSubject(reviewCase: TacticReviewCase): 'You' | 'They' {
  return reviewCase.mover === reviewCase.userColor ? 'You' : 'They';
}
