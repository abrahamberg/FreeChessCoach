import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { classifyTacticMotif } from './classify-tactic-motif.js';
import { tacticHitDetail } from './tactic-hit-detail.js';
import { tacticOpportunityReason } from './tactic-reason-text.js';
import {
  KNOWN_TACTIC_REVIEW_DEFECTS,
  TACTIC_REVIEW_CASES,
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
 * `todayMotif`/`todaySentence` onto its `targetMotif`/`targetSentence` and
 * drop its id from `KNOWN_TACTIC_REVIEW_DEFECTS`; the last test below is
 * what stops that bookkeeping from being skipped.
 */
function classify(reviewCase: TacticReviewCase) {
  const after = new Chess(reviewCase.fenBefore);
  after.move(reviewCase.moveSan);
  return classifyTacticMotif({
    fenBefore: reviewCase.fenBefore,
    moveSan: reviewCase.moveSan,
    mover: reviewCase.mover,
    quality: 'best',
    isCheckmate: after.isCheckmate(),
    isTacticalPosition: reviewCase.isTacticalPosition
  });
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

describe('reported Game Review cards', () => {
  test('every fixture position is legal and the move plays from it', () => {
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

    test(`${reviewCase.id} still prints its recorded sentence`, () => {
      expect(sentenceFor(reviewCase)).toBe(reviewCase.todaySentence);
    });
  }

  test('the defect list matches the cases that are actually still wrong', () => {
    const stillWrong = TACTIC_REVIEW_CASES.filter((c) => c.todayMotif !== c.targetMotif).map((c) => c.id);
    expect([...stillWrong].sort()).toEqual([...KNOWN_TACTIC_REVIEW_DEFECTS].sort());
  });

  test('a case whose motif is fixed has its sentence updated too', () => {
    const fixed = TACTIC_REVIEW_CASES.filter((c) => c.todayMotif === c.targetMotif);
    for (const reviewCase of fixed) {
      expect(reviewCase.todaySentence, `${reviewCase.id}: motif matches target but sentence does not`).toBe(
        reviewCase.todayMotif === null ? null : reviewCase.todaySentence
      );
    }
    // At least one case must be a true positive, or "fixed" could be
    // achieved by silencing every detector.
    expect(fixed.some((c) => c.targetMotif !== null)).toBe(true);
  });
});
