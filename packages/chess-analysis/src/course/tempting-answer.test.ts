import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { notTheAnswer } from './tempting.js';

/** A search of a position with `side` to move whose best line scores `cp` or mates in `mateIn` (White's view). */
const searched = (side: 'w' | 'b', cp: number | null, mateIn: number | null = null): EngineEval => ({
  ply: 0,
  fen: `7k/8/8/8/8/8/R7/1R4K1 ${side} - - 0 1`,
  depth: 12,
  lines: [{ moveSan: 'x', moveUci: '', cp, mateIn, pvSan: [] }]
});
/** Before the candidate the puzzle's side is to move; after it the other side is. */
const white = (cp: number | null, mateIn: number | null = null): EngineEval => searched('w', cp, mateIn);
const answer = (mover: 'w' | 'b', cp: number | null, mateIn: number | null = null): EngineEval => searched(mover === 'w' ? 'b' : 'w', cp, mateIn);

describe('why a working move is not the answer', () => {
  test('decided from the engine lines, for either side', () => {
    expect(notTheAnswer('white', white(null, 3), answer('w', null, 4))).toContain('mates too');
    expect(notTheAnswer('black', searched('b', null, -3), answer('b', null, -4))).toContain('mates too');
    expect(notTheAnswer('white', white(null, 3), answer('w', 300))).toContain('no mate');
    expect(notTheAnswer('white', white(900), answer('w', 300))).toContain('answer is stronger');
  });

  test('null when the move no longer stands better, or hands the other side a mate', () => {
    expect(notTheAnswer('white', white(900), answer('w', 20))).toBeNull();
    expect(notTheAnswer('white', white(900), answer('w', -300))).toBeNull();
    expect(notTheAnswer('white', white(900), answer('w', null, -2))).toBeNull();
  });

  test('the two mate counts are compared in numbers only when both searches can stand behind them (Task 125.6)', () => {
    // Mate in 2 against mate in 3 from the same position (2 after the candidate): both short.
    expect(notTheAnswer('white', white(null, 2), answer('w', null, 2))).toMatch(/\b3\b.*\b2\b/);
    // Mate in 5 against mate in 7 off depth-12 searches: slower, with no numbers.
    const long = notTheAnswer('white', white(null, 5), answer('w', null, 6));
    expect(long).toContain('mates too');
    expect(long).not.toMatch(/\d/);
    expect(notTheAnswer('white', white(null, 6), answer('w', 300))).not.toMatch(/\d/);
  });
});
