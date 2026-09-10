import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { removesDefenderDetector } from './removes-defender.js';

const DEFLECTION_FEN = '4k3/1p6/B1n5/8/8/8/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('removesDefenderDetector', () => {
  test('detects capturing the sole defender of a hanging piece', () => {
    expect(removesDefenderDetector.detect(buildTacticDetectionContext(DEFLECTION_FEN, 'Bxb7', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(removesDefenderDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
