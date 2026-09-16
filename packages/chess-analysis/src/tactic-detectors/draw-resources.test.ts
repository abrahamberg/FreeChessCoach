import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { simplifiesToDrawDetector, stalemateResourceDetector } from './draw-resources.js';

/** Qg6 leaves the king on h8 with nowhere to go and nothing to move. */
const STALEMATE_AVAILABLE = '7k/8/8/6Q1/8/8/8/7K w - - 0 1';
/** Black is a queen down; taking it leaves king and knight against a bare
 * king, which nobody can win. */
const LOSING_WITH_A_TRADE = '4k3/8/8/8/8/2n5/8/3QK3 b - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('stalemateResourceDetector', () => {
  test('claims a move that leaves the opponent stalemated', () => {
    const [claim] = stalemateResourceDetector.detect(buildTacticDetectionContext(STALEMATE_AVAILABLE, 'Qg6', 'white'));

    expect(claim).toMatchObject({ type: 'stalemateResource', actor: 'g6', gainKind: 'safety' });
  });

  test('does not flag a quiet developing move', () => {
    expect(stalemateResourceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});

describe('simplifiesToDrawDetector', () => {
  test('claims a trade into a position neither side can win, made by the losing side', () => {
    const [claim] = simplifiesToDrawDetector.detect(buildTacticDetectionContext(LOSING_WITH_A_TRADE, 'Nxd1', 'black'));

    expect(claim).toMatchObject({ type: 'simplifiesToDraw', gainKind: 'safety' });
  });

  test('does not flag a quiet developing move', () => {
    expect(simplifiesToDrawDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
