import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { countOnlyMoves, isOnlyMove } from './only-move.js';

describe('isOnlyMove', () => {
  const line = (moveSan: string, cp: number | null, mateIn: number | null = null) => ({ moveSan, moveUci: '', cp, mateIn });
  const two = (first: ReturnType<typeof line>, second: ReturnType<typeof line>): EngineEval => ({ ply: 0, fen: '', depth: 20, lines: [first, second] });

  test('the best move by the gap is the one answer; a slower mate is no second answer, a mate as fast is', () => {
    expect(isOnlyMove(two(line('Nf7+', null, 4), line('Ng6+', 900)), 'Nf7+', 'white')).toBe(true);
    expect(isOnlyMove(two(line('Nh6+', null, 3), line('Ne5+', null, 5)), 'Nh6+', 'white')).toBe(true);
    expect(isOnlyMove(two(line('Qg8+', null, 2), line('Qf7', null, 2)), 'Qg8+', 'white')).toBe(false);
    expect(isOnlyMove(two(line('Qxa1+', -1400), line('Kd7', -900)), 'Qxa1+', 'black')).toBe(true);
    expect(isOnlyMove(two(line('Qxa1+', -1400), line('Qh1+', -1250)), 'Qxa1+', 'black')).toBe(false);
  });
});

describe('countOnlyMoves', () => {
  const line = (moveSan: string, cp: number) => ({ moveSan, moveUci: '', cp, mateIn: null });
  const at = (first: ReturnType<typeof line>, second: ReturnType<typeof line>): EngineEval => ({ ply: 0, fen: '', depth: 20, lines: [first, second] });

  test('counts the side\'s clear-best positions and the ones where it played the move', () => {
    const evals = [
      at(line('Qxa1', 500), line('Kd7', 0)), // white: only move, found
      at(line('Kd7', 0), line('Ke7', -10)), // black: two fine answers
      at(line('Re8+', 400), line('Rb1', 0)) // white: only move, missed
    ];
    const moves = [
      { ply: 1, moveSan: 'Qxa1' },
      { ply: 3, moveSan: 'Rb1' }
    ];
    expect(countOnlyMoves(moves, evals, 'white')).toEqual({ positions: 2, found: 1 });
  });

  test('positions without two engine lines are not counted', () => {
    expect(countOnlyMoves([{ ply: 1, moveSan: 'e4' }], [], 'white')).toEqual({ positions: 0, found: 0 });
  });
});
