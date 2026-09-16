import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { blocksThreatDetector } from './blocks-threat.js';

/** The rook on e1 bears down the e-file at the king on e8; ...Be3 steps in
 * front of it. */
const ROOK_ON_THE_KING = '4k3/8/8/8/8/8/3b4/4RK2 b - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('blocksThreatDetector', () => {
  test('claims the piece it interposed for', () => {
    const [claim] = blocksThreatDetector.detect(buildTacticDetectionContext(ROOK_ON_THE_KING, 'Be3', 'black'));

    expect(claim).toMatchObject({ type: 'blocksThreat', actor: 'e3', targets: ['e8'], gainKind: 'safety' });
  });

  test('does not flag a quiet developing move', () => {
    expect(blocksThreatDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
