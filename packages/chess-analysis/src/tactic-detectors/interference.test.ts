import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { interferenceDetector } from './interference.js';

/** The rook on a8 guards the rook on e8 along the back rank; Nc8 stands
 * between them, and the white rook on e1 collects. */
const GUARD_ALONG_THE_RANK = 'r3r3/8/1N6/8/6k1/8/8/4R1K1 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('interferenceDetector', () => {
  test('claims the piece left undefended by the interposition', () => {
    const [claim] = interferenceDetector.detect(buildTacticDetectionContext(GUARD_ALONG_THE_RANK, 'Nc8', 'white'));

    expect(claim).toMatchObject({ type: 'interference', actor: 'c8', victim: 'e8', prize: 'rook', gainKind: 'material' });
  });

  test('does not flag a quiet developing move', () => {
    expect(interferenceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
