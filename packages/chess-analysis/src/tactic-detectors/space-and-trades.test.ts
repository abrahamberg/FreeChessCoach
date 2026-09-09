import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { favourableTradeDetector, improvesWorstPieceDetector, spaceGainDetector } from './space-and-trades.js';

const PAWN_CAN_CROSS = '4k3/8/8/8/4P3/8/8/4K3 w - - 0 1';
/** White is a rook up; trading bishop for knight keeps the extra rook and
 * takes a defender off. */
const AHEAD_ON_MATERIAL = '4k3/8/8/3n4/2B5/8/8/3RK3 w - - 0 1';
/** The bishop on h1 sees one square; a1 sees the whole long diagonal. */
const IDLE_BISHOP = '4k3/8/8/8/8/8/8/4K2B w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('spaceGainDetector', () => {
  test('claims a pawn crossing into the opponent half', () => {
    const [claim] = spaceGainDetector.detect(buildTacticDetectionContext(PAWN_CAN_CROSS, 'e5', 'white'));

    expect(claim).toMatchObject({ type: 'spaceGain', actor: 'e5', gainKind: 'positional' });
  });

  test('does not flag a first-rank pawn move', () => {
    expect(spaceGainDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});

describe('favourableTradeDetector', () => {
  test('claims an even trade made by the side that is already ahead', () => {
    const [claim] = favourableTradeDetector.detect(buildTacticDetectionContext(AHEAD_ON_MATERIAL, 'Bxd5', 'white'));

    expect(claim).toMatchObject({ type: 'favourableTrade', actor: 'd5', gainKind: 'positional' });
  });

  test('does not flag a quiet pawn move', () => {
    expect(favourableTradeDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});

describe('improvesWorstPieceDetector', () => {
  test('claims the least active piece getting something to do', () => {
    const [claim] = improvesWorstPieceDetector.detect(buildTacticDetectionContext(IDLE_BISHOP, 'Bd5', 'white'));

    expect(claim).toMatchObject({ type: 'improvesWorstPiece', actor: 'd5', gainKind: 'positional' });
  });

  test('does not flag a pawn move', () => {
    expect(improvesWorstPieceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
