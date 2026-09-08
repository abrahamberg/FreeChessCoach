import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { classifyTacticMotif } from './classify-tactic-motif.js';
import { buildTacticDetectionContext } from './tactic-detectors/context.js';
import { TACTIC_DETECTORS } from './tactic-detectors/registry.js';
import { tacticHitDetail } from './tactic-hit-detail.js';
import { tacticOpportunityReason } from './tactic-reason-text.js';
import {
  KNOWN_TACTIC_REVIEW_DEFECTS,
  TACTIC_REVIEW_CASES,
  TACTIC_REVIEW_TRUE_POSITIVES,
  type TacticReviewCase
} from './tactic-review-cases.js';

/**
 * Characterization tests for the reported Game Review cards (see
 * `tactic-review-cases.ts` and `docs/tactics-rework.md` §1).
 *
 * These assert what the pipeline does **today**, wrong answers included —
 * that is deliberate. A characterization test can't be written after the
 * fix, and the point of this file is that the moment someone changes a
 * detector, the exact sentence that changes shows up as a named diff rather
 * than as a number moving in a corpus test. When a case is fixed, move its
 * `today*` fields onto its `target*` fields, clear its `defect`, and drop it
 * from `KNOWN_TACTIC_REVIEW_DEFECTS`; the last three tests are what stop
 * that bookkeeping from being skipped.
 */
function classify(reviewCase: TacticReviewCase) {
  const after = new Chess(reviewCase.fenBefore);
  after.move(reviewCase.moveSan);
  return classifyTacticMotif({
    fenBefore: reviewCase.fenBefore,
    moveSan: reviewCase.moveSan,
    mover: reviewCase.mover,
    quality: reviewCase.quality,
    isCheckmate: after.isCheckmate(),
    isTacticalPosition: reviewCase.isTacticalPosition
  });
}

/** Every registry detector that matches, in priority order — the multi-label
 * view `classifyTacticMotif` collapses to its first hit. */
function detectorsFiring(reviewCase: TacticReviewCase): string[] {
  const context = buildTacticDetectionContext(reviewCase.fenBefore, reviewCase.moveSan, reviewCase.mover);
  return TACTIC_DETECTORS.filter((detector) => detector.detect(context)).map((detector) => detector.type);
}

/** The full sentence the review prints for a card, or `null` for the
 * "Nothing to flag" empty state — the same two steps `build-game-report.ts`
 * runs (`classifyTacticMotifOpportunity` then `tacticOpportunityReason`),
 * with the played move standing in for the engine's best move. */
function sentenceFor(reviewCase: TacticReviewCase): string | null {
  const motif = classify(reviewCase);
  if (!motif) return null;
  const detail = tacticHitDetail(motif, reviewCase.fenBefore, reviewCase.moveSan, reviewCase.mover);
  return tacticOpportunityReason({ type: motif, found: true, detail: detail?.text ?? null }, reviewCase.moveSan);
}

function isStillWrong(reviewCase: TacticReviewCase): boolean {
  const sameMotif = reviewCase.todayMotif === reviewCase.targetMotif;
  const sameDetectors =
    reviewCase.todayDetectors.length === reviewCase.targetDetectors.length &&
    reviewCase.todayDetectors.every((type) => (reviewCase.targetDetectors as readonly string[]).includes(type));
  return !sameMotif || !sameDetectors;
}

describe('reported Game Review cards', () => {
  test('every fixture position is legal and its move plays from it', () => {
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      const board = new Chess(reviewCase.fenBefore);
      expect(board.turn(), `${reviewCase.id}: mover disagrees with the FEN`).toBe(reviewCase.mover === 'white' ? 'w' : 'b');
      expect(() => board.move(reviewCase.moveSan), `${reviewCase.id}: ${reviewCase.moveSan} is not legal here`).not.toThrow();
    }
  });

  for (const reviewCase of TACTIC_REVIEW_CASES) {
    test(`${reviewCase.id} still classifies as ${reviewCase.todayMotif ?? 'no motif'}`, () => {
      expect(classify(reviewCase)).toBe(reviewCase.todayMotif);
    });

    test(`${reviewCase.id} still fires exactly [${reviewCase.todayDetectors.join(', ')}]`, () => {
      expect(detectorsFiring(reviewCase)).toEqual([...reviewCase.todayDetectors]);
    });

    test(`${reviewCase.id} still prints its recorded sentence`, () => {
      expect(sentenceFor(reviewCase)).toBe(reviewCase.todaySentence);
    });
  }

  test('the defect list matches the cases whose output differs from target', () => {
    const stillWrong = TACTIC_REVIEW_CASES.filter(isStillWrong).map((c) => c.id);
    expect([...stillWrong].sort()).toEqual([...KNOWN_TACTIC_REVIEW_DEFECTS].sort());
  });

  test("each case's hand-written defect kind agrees with the computed mismatch", () => {
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      expect(reviewCase.defect === null, `${reviewCase.id}: defect kind and today-vs-target mismatch disagree`).toBe(
        !isStillWrong(reviewCase)
      );
    }
  });

  test('the target state still names a tactic on the true positives', () => {
    // Without this, every ceiling in tactic-precision.test.ts could be met by
    // deleting the detectors.
    for (const id of TACTIC_REVIEW_TRUE_POSITIVES) {
      const reviewCase = TACTIC_REVIEW_CASES.find((c) => c.id === id);
      expect(reviewCase, `${id} is listed as a true positive but is not in the fixture`).toBeDefined();
      expect(reviewCase?.targetMotif, `${id} must still name a motif after the rework`).not.toBeNull();
    }
  });
});

/**
 * `trappedPieces` asks "does this piece have a legal move to a square the
 * opponent doesn't attack?", and `chess.moves({ square })` answers "no" for
 * *every* non-king piece while its own side is in check. So a check turns
 * every attacked enemy piece into a trapped one. Measured on
 * `tactic-precision.test.ts`'s opening corpus: 20.7% of checks produce a
 * trapped piece against a 1.0% baseline on quiet moves.
 *
 * Recorded here rather than in `tactic-trapped.test.ts` because it is a
 * characterization of a known defect, not a statement of intended behaviour
 * — TR-07's white queen is attacked and short of squares, but it is not
 * trapped; White simply has to answer the check first.
 */
describe('trapped-piece detection while the side to move is in check', () => {
  const inCheck = TACTIC_REVIEW_CASES.find((c) => c.id === 'TR-07-discovered-attack-sacrifice');

  test('today, a check is enough to report the enemy queen as trapped', () => {
    expect(inCheck).toBeDefined();
    if (!inCheck) return;
    const after = new Chess(inCheck.fenBefore);
    after.move(inCheck.moveSan);
    expect(after.isCheck(), 'the position must be a check for this case to mean anything').toBe(true);
    expect(tacticHitDetail('trappedPiece', inCheck.fenBefore, inCheck.moveSan, inCheck.mover)?.text).toBe(
      'queen on e4 is trapped'
    );
  });
});
