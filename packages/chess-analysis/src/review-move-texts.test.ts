import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { coachReviewTexts, reviewMoveTexts, tacticCardTexts } from './review-move-texts.js';

const move = (patch: Partial<ClassifiedMoveDto>): ClassifiedMoveDto => ({
  ply: 1, moveSan: 'e4', mover: 'white', isUserMove: true, cpLoss: 0, quality: 'good', bestLineSan: ['d4'], evalAfterCp: 0, hangsPiece: false, ...patch
});

describe('reviewMoveTexts', () => {
  test('a card sentence baked into reasons is shown once, as the card', () => {
    const withCard = move({ quality: 'mistake', tacticAllowed: { type: 'fork', byMoveSan: 'Nc7' } });
    const card = tacticCardTexts(withCard).allowed ?? '';
    const texts = reviewMoveTexts({ ...withCard, reasons: [card, 'Concedes the centre'] });
    expect(texts.filter((each) => each.text === card)).toHaveLength(1);
    expect(texts.map((each) => each.kind)).toEqual(['allowed', 'reason']);
  });

  test('"better was" only when a costly move has no other note', () => {
    expect(reviewMoveTexts(move({ quality: 'mistake' })).map((each) => each.kind)).toEqual(['betterWas']);
    expect(reviewMoveTexts(move({ quality: 'mistake', reasons: ['Concedes the centre'] })).map((each) => each.kind)).toEqual(['reason']);
    expect(reviewMoveTexts(move({ quality: 'good' }))).toEqual([]);
  });
});

describe('coachReviewTexts', () => {
  test('a missed tactic is what the best move had; a found one is the played move\'s own merit', () => {
    const missed = coachReviewTexts(move({ quality: 'mistake', bestMoveSan: 'Qxf5+', tacticOpportunity: { type: 'fork', found: false } }));
    expect(missed.bestWasBetter[0]).toContain('missed a chance');
    expect(missed.aboutMove).toEqual([]);

    const found = coachReviewTexts(move({ bestMoveSan: 'e4', tacticOpportunity: { type: 'fork', found: true } }));
    expect(found.aboutMove).toHaveLength(1);
    expect(found.bestWasBetter).toEqual([]);
  });

  test('notes on the move stay with the move, and a bare "better was" goes to the best move', () => {
    const noted = coachReviewTexts(move({ quality: 'mistake', reasons: ['Concedes the centre'] }));
    expect(noted).toEqual({ aboutMove: ['Concedes the centre'], bestWasBetter: [] });
    expect(coachReviewTexts(move({ quality: 'mistake' })).bestWasBetter).toEqual(['mistake: better was d4']);
  });
});
