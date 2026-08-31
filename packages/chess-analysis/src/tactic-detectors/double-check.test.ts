import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { doubleCheckDetector } from './double-check.js';

const DOUBLE_CHECK_FEN = '7k/8/8/4N3/8/8/8/Q6K w - - 0 1';
const SINGLE_CHECK_FEN = '7k/8/8/8/8/8/8/Q6K w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('doubleCheckDetector', () => {
  test('detects a knight move that both checks and unmasks the queen', () => {
    expect(doubleCheckDetector.detect(buildTacticDetectionContext(DOUBLE_CHECK_FEN, 'Nf7+', 'white'))).toBe(true);
  });

  test('does not flag an ordinary single check', () => {
    expect(doubleCheckDetector.detect(buildTacticDetectionContext(SINGLE_CHECK_FEN, 'Qa8+', 'white'))).toBe(false);
  });

  test('does not flag a quiet developing move', () => {
    expect(doubleCheckDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toBe(false);
  });
});
