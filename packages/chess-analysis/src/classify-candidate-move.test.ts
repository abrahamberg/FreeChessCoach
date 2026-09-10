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

  test('a quiet move stays null even once a forced mate is signalled via linesAtFenBefore', () => {
    // The mate line makes `isTacticalPosition` true, which used to turn a
    // quiet move into the `'other'` catch-all — a card claiming a tactic it
    // could not name. Since docs/tactics-rework.md's rework the sharpness of
    // the position is no longer, on its own, something to say about the move.
    const withoutLines = classifyCandidateMove(QUIET_FEN, 'e4', 'white');
    const withMateLine = classifyCandidateMove(QUIET_FEN, 'e4', 'white', {
      linesAtFenBefore: [{ moveUci: 'e2e4', moveSan: 'e4', cp: null, mateIn: 3 }]
    });

    expect(withoutLines).toBeNull();
    expect(withMateLine).toBeNull();
  });
});
