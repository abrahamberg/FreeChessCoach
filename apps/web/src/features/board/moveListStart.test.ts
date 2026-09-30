import { describe, expect, test } from 'vitest';
import { moveListStart } from './moveListStart.js';

describe('moveListStart', () => {
  test('reads the side to move and the move number from the FEN', () => {
    expect(moveListStart('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({ moveNumber: 1, blackFirst: false });
    expect(moveListStart('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 12')).toEqual({ moveNumber: 12, blackFirst: true });
  });
});
