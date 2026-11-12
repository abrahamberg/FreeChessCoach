import { describe, expect, test } from 'vitest';
import { readReviewLink } from './review-link.js';

describe('readReviewLink', () => {
  test('reads the game, the side and the ply, and ignores what it cannot use', () => {
    const pgn = '1. e4 e5 2. Nf3 *';
    expect(readReviewLink(`#pgn=${encodeURIComponent(pgn)}&side=black&ply=3`)).toEqual({ pgn, side: 'black', ply: 3 });
    expect(readReviewLink('#side=green&ply=-1')).toEqual({ pgn: null, side: 'white', ply: null });
    expect(readReviewLink('')).toEqual({ pgn: null, side: 'white', ply: null });
  });
});
