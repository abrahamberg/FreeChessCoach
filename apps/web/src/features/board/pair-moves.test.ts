import { describe, expect, test } from 'vitest';
import { pairMoves } from './pair-moves.js';

describe('pairMoves', () => {
  test('a game starts at 1. with White', () => {
    expect(pairMoves(['e4', 'e5', 'Nf3'], { moveNumber: 1, blackFirst: false })).toEqual([
      { moveNumber: 1, white: { ply: 1, san: 'e4' }, black: { ply: 2, san: 'e5' } },
      { moveNumber: 2, white: { ply: 3, san: 'Nf3' }, black: undefined }
    ]);
  });

  test('a course that starts on Black\'s move numbers from its start, Black first', () => {
    expect(pairMoves(['Nc6', 'Bb5', 'a6'], { moveNumber: 2, blackFirst: true })).toEqual([
      { moveNumber: 2, white: undefined, black: { ply: 1, san: 'Nc6' } },
      { moveNumber: 3, white: { ply: 2, san: 'Bb5' }, black: { ply: 3, san: 'a6' } }
    ]);
  });
});
