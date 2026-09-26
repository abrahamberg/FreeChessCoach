import { describe, expect, test } from 'vitest';
import { arrowMoveSan } from './arrow-move-san.js';

// White: Kg1, Qe2, Nf3, pawn e5. Black: Ke8, Qd8, pawn d7. White to move.
const FEN = '3qk3/3p4/8/4P3/8/5N2/4Q3/6K1 w - - 0 1';

describe('arrowMoveSan', () => {
  test('names a legal move for the side to move, check included', () => {
    expect(arrowMoveSan(FEN, 'e2', 'b5')).toBe('Qb5');
    expect(arrowMoveSan(FEN, 'e2', 'e4')).toBe('Qe4');
    expect(arrowMoveSan(FEN, 'f3', 'd4')).toBe('Nd4');
  });

  test('names a move of the side NOT to move — an arrow pointing at a threat', () => {
    expect(arrowMoveSan(FEN, 'd8', 'g5')).toBe('Qg5+');
  });

  test('promotes to a queen when the arrow reaches the last rank', () => {
    expect(arrowMoveSan('8/4P3/8/8/8/8/k7/6K1 w - - 0 1', 'e7', 'e8')).toBe('e8=Q');
  });

  test('null when no piece of either side can make that move', () => {
    expect(arrowMoveSan(FEN, 'a1', 'h8')).toBeNull();
    expect(arrowMoveSan(FEN, 'f3', 'f5')).toBeNull();
    expect(arrowMoveSan('not a fen', 'e2', 'e4')).toBeNull();
  });
});
