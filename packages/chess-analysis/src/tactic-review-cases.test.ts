import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { classifyTacticClaims } from './classify-tactic-motif.js';
import { TACTIC_DETECTORS } from './tactic-detectors/registry.js';
import { tacticOpportunityReason } from './tactic-reason-text.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';
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
 * These assert what the pipeline does **today**. They were written against
 * the wrong answers on purpose — a characterization test can't be written
 * after the fix — and the point of the file is that the moment someone
 * changes a detector, the exact sentence that changes shows up as a named
 * diff rather than as a number moving in a corpus test. All ten now agree
 * with their targets, so `today*` and `target*` are the same and the suite is
 * a regression guard on the rework rather than a debt list.
 *
 * When a case changes, move its `today*` fields onto its `target*` fields,
 * clear its `defect`, and update `KNOWN_TACTIC_REVIEW_DEFECTS`; the
 * bookkeeping tests below are what stop any of those three steps from being
 * skipped.
 */
function classificationOf(reviewCase: TacticReviewCase) {
  const after = new Chess(reviewCase.fenBefore);
  after.move(reviewCase.moveSan);
  return classifyTacticClaims({
    fenBefore: reviewCase.fenBefore,
    moveSan: reviewCase.moveSan,
    mover: reviewCase.mover,
    quality: reviewCase.quality,
    isCheckmate: after.isCheckmate(),
    isTacticalPosition: reviewCase.isTacticalPosition,
    previous: reviewCase.previous ?? null
  });
}

function classify(reviewCase: TacticReviewCase) {
  return classificationOf(reviewCase).headline;
}

/** Every motif this move survives verification with, best first — the
 * multi-label view the shipped classifier collapsed to its first hit. */
function claimsOn(reviewCase: TacticReviewCase): string[] {
  return classificationOf(reviewCase).claims.map((claim) => claim.type);
}

/** The full sentence the review prints for a card, or `null` for the
 * "Nothing to flag" empty state — the same steps `build-game-report.ts` runs
 * (`classifyTacticMotifOpportunity` then `tacticOpportunityReason`), with the
 * played move standing in for the engine's best move. */
function sentenceFor(reviewCase: TacticReviewCase): string | null {
  const { headline, claims } = classificationOf(reviewCase);
  if (!headline) return null;
  const leading: VerifiedTacticClaim | undefined = claims.find((claim) => claim.type === headline) ?? claims[0];

  return tacticOpportunityReason(
    {
      type: headline,
      found: true,
      detail: leading?.detail ?? null,
      gain: leading ? { kind: leading.gainKind, pawns: leading.verifiedGain, prize: leading.prize } : undefined,
      confidence: leading?.confidence,
      isUserMove: reviewCase.mover === reviewCase.userColor
    },
    reviewCase.moveSan
  );
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

    test(`${reviewCase.id} still claims exactly [${reviewCase.todayDetectors.join(', ')}]`, () => {
      expect(claimsOn(reviewCase)).toEqual([...reviewCase.todayDetectors]);
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
    // checkmate and brilliantSacrifice come from the move's own quality,
    // never from a detector, so they can head a card but can never appear in
    // a claim set.
    const detectorTypes = new Set<string>(TACTIC_DETECTORS.map((detector) => detector.type));
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      for (const motif of [...reviewCase.todayDetectors, ...reviewCase.targetDetectors]) {
        expect(detectorTypes.has(motif), `${reviewCase.id}: "${motif}" is not a detector`).toBe(true);
      }
    }
  });

  test('no card names a square its claim did not verify', () => {
    // docs/tactics-rework.md §3 rule 2 and the acceptance bar's "Voice"
    // clause: specificity is earned. A sentence may only mention a square
    // that appears in the claim behind it.
    for (const reviewCase of TACTIC_REVIEW_CASES) {
      const sentence = sentenceFor(reviewCase);
      if (sentence === null) continue;
      const claimed = new Set(classificationOf(reviewCase).claims.flatMap((claim) => [claim.actor, ...claim.targets]));
      for (const square of sentence.match(/\b[a-h][1-8]\b/g) ?? []) {
        expect(claimed.has(square as never), `${reviewCase.id}: names ${square}, which no claim covers`).toBe(true);
      }
    }
  });
});

/**
 * `trappedPieces` asked "does this piece have a legal move to a square the
 * opponent doesn't also attack?" and read a `chess.moves({ square })` of zero
 * as "cornered". A piece has zero legal moves for two other, much more common
 * reasons: its own side is in check, or it is absolutely pinned. Neither
 * makes it trapped.
 *
 * Attributing every `trappedPieces` report across the 400-line opening corpus
 * before the fix: **71.7% absolutely pinned, 13.2% side in check, 15.1%
 * genuinely cornered** — 85% of the detector's output in ordinary play was an
 * artefact, and it is why `trappedPiece` co-fired on all three real pins in
 * this fixture.
 */
describe('trapped-piece detection on pieces that simply cannot move', () => {
  function trappedClaimsFor(id: string): string[] {
    const reviewCase = caseById(id);
    return classificationOf(reviewCase).claims.filter((claim) => claim.type === 'trappedPiece').map((claim) => claim.detail);
  }

  test('a check alone no longer reports the enemy queen as trapped', () => {
    const reviewCase = caseById('TR-07-discovered-attack-sacrifice');
    const after = new Chess(reviewCase.fenBefore);
    after.move(reviewCase.moveSan);
    expect(after.isCheck(), 'the position must be a check for this case to mean anything').toBe(true);
    // The queen is attacked and short of squares, but White simply has to
    // answer the check first — it is not trapped.
    expect(trappedClaimsFor('TR-07-discovered-attack-sacrifice')).toEqual([]);
  });

  test('an absolute pin alone no longer reports the pinned piece as trapped', () => {
    // TR-10's bishop is defended twice and pinned; TR-01's knight is defended
    // and pinned. Both are ordinary opening positions, neither piece is lost,
    // and both moves now produce the pin alone.
    expect(trappedClaimsFor('TR-10-real-pin-on-the-open-file')).toEqual([]);
    expect(trappedClaimsFor('TR-01-real-pin-with-noise')).toEqual([]);
  });
});
