import { describe, expect, test } from 'vitest';
import { classifyCandidateMove } from './classify-candidate-move.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('classifyCandidateMove', () => {
  test('matches classifyTacticMotif with zero options (parity proof)', () => {
    expect(classifyCandidateMove(FORK_FEN, 'Nd6+', 'white')).toBe('fork');
  });

  test('an illegal move returns null rather than throwing', () => {
    expect(classifyCandidateMove(QUIET_FEN, 'Qh5+', 'white')).toBeNull();
  });

  test('a quiet move is null without engine lines, but "other" once a forced mate is signaled via linesAtFenBefore', () => {
    expect(classifyCandidateMove(QUIET_FEN, 'e4', 'white')).toBeNull();

    const withMateLine = classifyCandidateMove(QUIET_FEN, 'e4', 'white', {
      linesAtFenBefore: [{ moveUci: 'e2e4', moveSan: 'e4', cp: null, mateIn: 3 }]
    });
    expect(withMateLine).toBe('other');
  });
});
