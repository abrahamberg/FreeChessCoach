import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import type { MoveStory } from './move-story.js';
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

describe('reviewMoveTexts from a story', () => {
  const develops = (square: 'c3' | 'f3' | 'e2' | 'd2'): MoveStory['ideas'][number] => ({ kind: 'develops', piece: { piece: 'n', square }, natural: false });
  const story = (patch: Partial<MoveStory>): Record<string, unknown> => ({ notes: [], ideas: [], alternatives: [], bestInstead: null, ...patch });

  test('a fine move shows its most telling ideas, the rest and the other moves under "more"', () => {
    const texts = reviewMoveTexts(move({ quality: 'good', story: story({ ideas: [develops('c3'), develops('f3'), develops('e2'), develops('d2')], alternatives: [{ san: 'd4', verdict: 'White is slightly better', ideas: [], line: [] }] }) }));
    expect(texts.map((each) => [each.kind, Boolean(each.more)])).toEqual([['idea', false], ['idea', false], ['idea', false], ['idea', true], ['alternative', true]]);
  });

  test('a costly move leads with its fault and the better move, with what that does', () => {
    const better = { san: 'Re1', verdict: 'White is slightly better', ideas: [], line: ['Nf6'] };
    const texts = reviewMoveTexts(move({ quality: 'inaccuracy', story: story({ notes: ['Leaves the pawn on a5 where it can be won'], ideas: [develops('c3')], alternatives: [better], bestInstead: { san: 'Re1', line: [], board: [], balance: '' } }) }));
    expect(texts.map((each) => [each.kind, Boolean(each.more)])).toEqual([['reason', false], ['idea', true], ['better', false]]);
    expect(texts.at(-1)?.text).toBe('Re1: White is slightly better, after Nf6');
  });
});
