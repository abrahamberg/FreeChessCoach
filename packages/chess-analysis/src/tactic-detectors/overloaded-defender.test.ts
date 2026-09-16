import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { overloadedDefenderDetector } from './overloaded-defender.js';

/** Black knight d7 is the sole defender of both the b8 rook and the f6
 * bishop; the white rook on b1 already attacks b8, so sliding the other
 * white rook onto the f-file to attack f6 overloads the knight. */
const OVERLOAD_FEN = '1r5k/3n4/5b2/8/8/8/4K3/1RR5 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('overloadedDefenderDetector', () => {
  test('detects a move that overloads a defender guarding two pieces', () => {
    expect(overloadedDefenderDetector.detect(buildTacticDetectionContext(OVERLOAD_FEN, 'Rf1', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(overloadedDefenderDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
