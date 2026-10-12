import { describe, expect, test } from 'vitest';
import { cutAtQuizzes } from './quiz-cuts.js';

const IDS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

describe('cutAtQuizzes', () => {
  test('without a quiz the span stays whole', () => {
    expect(cutAtQuizzes(IDS, [])).toEqual([IDS]);
  });

  test('each piece ends on its quiz move and the last keeps the tail', () => {
    expect(cutAtQuizzes(IDS, ['n2', 'n4'])).toEqual([['n1', 'n2'], ['n3', 'n4'], ['n5', 'n6']]);
  });

  test('the pieces together are the span, in order, and hold at most one quiz each', () => {
    const quizzes = ['n1', 'n3', 'n6'];
    const pieces = cutAtQuizzes(IDS, quizzes);

    expect(pieces.flat()).toEqual(IDS);
    for (const piece of pieces) expect(piece.filter((id) => quizzes.includes(id)).length).toBeLessThanOrEqual(1);
  });

  test('a quiz that is not in the span is ignored', () => {
    expect(cutAtQuizzes(IDS, ['n9'])).toEqual([IDS]);
  });
});
