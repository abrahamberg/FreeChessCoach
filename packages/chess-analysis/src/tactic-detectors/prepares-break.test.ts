import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { preparesBreakDetector } from './prepares-break.js';

/** The rook on b6 sits in front of the b5 pawn; move it and b6 becomes a
 * break at the c7 pawn. */
const ROOK_IN_THE_WAY = '4k3/2p5/1R6/1P6/8/8/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('preparesBreakDetector', () => {
  test('claims the break the move opened up', () => {
    const [claim] = preparesBreakDetector.detect(buildTacticDetectionContext(ROOK_IN_THE_WAY, 'Ra6', 'white'));

    expect(claim).toMatchObject({ type: 'preparesBreak', actor: 'a6', targets: ['b6'], gainKind: 'positional' });
  });

  test('does not flag a pawn move', () => {
    expect(preparesBreakDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
