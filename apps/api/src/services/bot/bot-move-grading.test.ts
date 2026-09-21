import { describe, expect, test } from 'vitest';
import { engineEvalFromScore } from './bot-move-grading.js';

describe('engineEvalFromScore', () => {
  test('is a single line carrying just the score, for the position it is given', () => {
    const result = engineEvalFromScore('some fen', { cp: -40, mateIn: null });

    expect(result.fen).toBe('some fen');
    expect(result.lines).toEqual([{ moveUci: '', moveSan: '', cp: -40, mateIn: null }]);
  });

  test('keeps a mate score as a mate', () => {
    expect(engineEvalFromScore('f', { cp: null, mateIn: 3 }).lines[0]).toMatchObject({ cp: null, mateIn: 3 });
  });
});
