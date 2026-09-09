import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { skewerDetector } from './skewer.js';

const SKEWER_FEN = 'r7/8/8/k7/8/8/8/1R5K w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('skewerDetector', () => {
  test('detects a skewer-creating check', () => {
    expect(skewerDetector.detect(buildTacticDetectionContext(SKEWER_FEN, 'Ra1+', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(skewerDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
