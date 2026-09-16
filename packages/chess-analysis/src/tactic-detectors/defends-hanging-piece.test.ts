import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { defendsHangingPieceDetector } from './defends-hanging-piece.js';

/** Black's bishop on d5 hangs to the b3 bishop; ...Ra5 guards it along the
 * fifth rank, turning the capture into an even trade. */
const HANGING_BISHOP = 'r3k3/8/8/3b4/8/1B6/8/4K3 b - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('defendsHangingPieceDetector', () => {
  test('claims the piece it saved, not the piece that moved', () => {
    const [claim, ...rest] = defendsHangingPieceDetector.detect(buildTacticDetectionContext(HANGING_BISHOP, 'Ra5', 'black'));

    expect(rest).toEqual([]);
    expect(claim).toMatchObject({ type: 'defendsHangingPiece', actor: 'a5', targets: ['d5'], gainKind: 'safety' });
  });

  test('does not flag a quiet developing move', () => {
    expect(defendsHangingPieceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
