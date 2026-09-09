import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { classifyTacticMotif } from './classify-tactic-motif.js';
import { buildTacticDetectionContext } from './tactic-detectors/context.js';
import { TACTIC_DETECTORS } from './tactic-detectors/registry.js';
import { tacticHitDetail } from './tactic-hit-detail.js';
import { tacticOpportunityReason } from './tactic-reason-text.js';
import { expectedSubject, isTacticReviewCaseUnfixed, type TacticReviewCase } from './tactic-review-case.js';
import {
  KNOWN_TACTIC_REVIEW_DEFECTS,
  TACTIC_REVIEW_CASES,
  tacticReviewTruePositives,
  unfixedTacticReviewCases
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
 * from `KNOWN_TACTIC_REVIEW_DEFECTS`; the bookkeeping tests below are what
 * stop any of those three steps from being skipped.
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

function caseById(id: string): TacticReviewCase {
  const reviewCase = TACTIC_REVIEW_CASES.find((candidate) => candidate.id === id);
  if (!reviewCase) throw new Error(`${id} is missing from TACTIC_REVIEW_CASES`);
  return reviewCase;
}

describe('reported Game Review cards', () => {
  test('every fixture position is legal and its move plays from it', () => {
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      const board = new Chess(reviewCase.fenBefore);
      expect(board.turn(), `${reviewCase.id}: mover disagrees with the FEN`).toBe(reviewCase.mover === 'white' ? 'w' : 'b');
      expect(() => board.move(reviewCase.moveSan), `${reviewCase.id}: ${reviewCase.moveSan} is not legal here`).not.toThrow();
    }
  });

  test('every case id is unique', () => {
    const ids = TACTIC_REVIEW_CASES.map((reviewCase) => reviewCase.id);
    expect(new Set(ids).size).toBe(ids.length);
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
    const stillWrong = unfixedTacticReviewCases().map((reviewCase) => reviewCase.id);
    expect([...stillWrong].sort()).toEqual([...KNOWN_TACTIC_REVIEW_DEFECTS].sort());
  });

  test("each case's hand-written defect kind agrees with the computed mismatch", () => {
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      expect(reviewCase.defect === null, `${reviewCase.id}: defect kind and today-vs-target mismatch disagree`).toBe(
        !isTacticReviewCaseUnfixed(reviewCase)
      );
    }
  });

  test('the fixture keeps enough real tactics to be worth passing', () => {
    // Without this floor, every ceiling in tactic-precision.test.ts could be
    // met by deleting the detectors and nulling every target.
    expect(tacticReviewTruePositives().length).toBeGreaterThanOrEqual(5);
  });

  test('every target sentence addresses the reader as the card would', () => {
    // docs/tactics-rework.md §3 rule 3: the card is written to the user, so an
    // opponent move reads "They …" even though the motif is the mover's.
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      if (reviewCase.targetSentence === null) continue;
      const subject = expectedSubject(reviewCase);
      expect(
        reviewCase.targetSentence.startsWith(subject),
        `${reviewCase.id}: ${reviewCase.mover} move in a ${reviewCase.userColor} review must open with "${subject}"`
      ).toBe(true);
    }
  });

  test('no case claims a pre-check motif as a registry detector', () => {
    // checkmate/brilliantSacrifice/other are answered by classifyTacticMotif
    // itself, never by a detector, so they can head a card but can never
    // appear in a detector set.
    const detectorTypes = new Set<string>(TACTIC_DETECTORS.map((detector) => detector.type));
    const newMotifs = new Set(['breaksPin', 'gainsTempo', 'discoveredCheck']);
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      for (const motif of [...reviewCase.todayDetectors, ...reviewCase.targetDetectors]) {
        expect(detectorTypes.has(motif) || newMotifs.has(motif), `${reviewCase.id}: "${motif}" is not a detector`).toBe(true);
      }
    }
  });
});

/**
 * `trappedPieces` asks "does this piece have a legal move to a square the
 * opponent doesn't attack?" and reads a `chess.moves({ square })` of zero as
 * "cornered". But a piece has zero legal moves for two other, much more
 * common reasons: its own side is in check, or it is absolutely pinned.
 * Neither makes it trapped.
 *
 * Attributing every `trappedPieces` report across the 400-line opening
 * corpus: **71.7% absolutely pinned, 13.2% side in check, 15.1% genuinely
 * cornered** — so 85% of the detector's output in ordinary play is an
 * artefact. (In sharp puzzle positions the mix inverts to 76.8% genuinely
 * cornered, which is the point: the bug dominates exactly where the noise
 * hurts most.)
 *
 * Recorded here rather than in `tactic-trapped.test.ts` because these are
 * characterizations of a known defect, not statements of intended behaviour.
 */
describe('trapped-piece detection on pieces that simply cannot move', () => {
  function trappedDetailFor(id: string): string | undefined {
    const reviewCase = caseById(id);
    return tacticHitDetail('trappedPiece', reviewCase.fenBefore, reviewCase.moveSan, reviewCase.mover)?.text;
  }

  test('today, a check alone reports the enemy queen as trapped', () => {
    const reviewCase = caseById('TR-07-discovered-attack-sacrifice');
    const after = new Chess(reviewCase.fenBefore);
    after.move(reviewCase.moveSan);
    expect(after.isCheck(), 'the position must be a check for this case to mean anything').toBe(true);
    // The queen is attacked and short of squares, but White simply has to
    // answer the check first — it is not trapped.
    expect(trappedDetailFor('TR-07-discovered-attack-sacrifice')).toBe('queen on e4 is trapped');
  });

  test('today, an absolute pin alone reports the pinned piece as trapped', () => {
    // TR-10's bishop is defended twice and pinned; TR-01's knight is defended
    // and pinned. Both are ordinary opening positions, neither piece is lost.
    expect(trappedDetailFor('TR-10-real-pin-on-the-open-file')).toBe('bishop on e7 is trapped');
    expect(trappedDetailFor('TR-01-real-pin-with-noise')).toBe('knight on c6 is trapped');
  });
});
