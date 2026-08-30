import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { trappedPieceDetector } from './trapped-piece.js';

/** Same trap structure (rook a1 vs. knight a8, knight d5 covering the flight
 * squares) as tactic-trapped.test.ts's fixture — the white king's own move
 * doesn't disturb it, so the resulting `after` position is equivalent. */
const TRAP_SETUP_FEN = 'n6k/8/8/3N4/8/8/8/R3K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('trappedPieceDetector', () => {
  test('detects a move after which the opponent has a cornered piece', () => {
    expect(trappedPieceDetector.detect(buildTacticDetectionContext(TRAP_SETUP_FEN, 'Kf1', 'white'))).toBe(true);
  });

  test('does not flag a quiet developing move', () => {
    expect(trappedPieceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toBe(false);
  });
});
