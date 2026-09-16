import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { weakBackRankDetector } from './weak-back-rank.js';

const BACK_RANK_FEN = '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('weakBackRankDetector', () => {
  test('detects a rook infiltrating a pawn-boxed back rank', () => {
    expect(weakBackRankDetector.detect(buildTacticDetectionContext(BACK_RANK_FEN, 'Ra8#', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(weakBackRankDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
