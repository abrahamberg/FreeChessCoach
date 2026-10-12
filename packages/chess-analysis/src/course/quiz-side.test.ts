import { describe, expect, test } from 'vitest';
import { quizSideProblems } from './quiz-side.js';
import { parseCourseTree } from './tree.js';

const TEXT = '1. e4 e5 @quiz 2. Nf3 @quiz Nc6 *';

describe('quizSideProblems', () => {
  test('a quiz on a move of the other side is a problem naming the move', () => {
    const problems = quizSideProblems(parseCourseTree(TEXT), 'white');

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('1...e5, a move by Black, but the learner plays White');
  });

  test('a quiz on the learner’s own moves is fine', () => {
    expect(quizSideProblems(parseCourseTree('1. e4 @quiz e5 2. Nf3 @quiz Nc6 *'), 'white')).toEqual([]);
  });
});
