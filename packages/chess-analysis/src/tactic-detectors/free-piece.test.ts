import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { freePieceDetector } from './free-piece.js';

const FREE_PIECE_FEN = '7k/8/8/3q4/2B5/8/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('freePieceDetector', () => {
  test('detects capturing an undefended piece', () => {
    expect(freePieceDetector.detect(buildTacticDetectionContext(FREE_PIECE_FEN, 'Bxd5', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(freePieceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
