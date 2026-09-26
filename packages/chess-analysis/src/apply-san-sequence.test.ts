import { describe, expect, test } from 'vitest';
import { applySanSequence } from './apply-san-sequence.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('applySanSequence', () => {
  test('replays legal moves', () => {
    const result = applySanSequence(START, ['e4', 'e5']);
    expect(result.error).toBeNull();
    expect(result.moves.map((move) => move.uci)).toEqual(['e2e4', 'e7e5']);
  });

  test('an out-of-turn move names the side to move, keeping the moves applied before it', () => {
    const result = applySanSequence(START, ['e4', 'Nf3']);
    expect(result.moves).toHaveLength(1);
    expect(result.error).toBe('Illegal move: Nf3 (Black to move)');
  });
});
