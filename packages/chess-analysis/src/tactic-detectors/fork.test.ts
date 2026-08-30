import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { forkDetector } from './fork.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('forkDetector', () => {
  test('detects a fork-creating move', () => {
    expect(forkDetector.detect(buildTacticDetectionContext(FORK_FEN, 'Nd6+', 'white'))).toBe(true);
  });

  test('does not flag a quiet developing move', () => {
    expect(forkDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toBe(false);
  });
});
