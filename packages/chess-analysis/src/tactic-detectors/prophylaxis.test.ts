import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { prophylaxisDetector } from './prophylaxis.js';

/** The knight on b4 is one hop from c2, where it would fork the king on e1
 * and the rook on a1. Kf1 empties e1 and the fork square is worth nothing. */
const KNIGHT_EYEING_A_FORK = '4k3/8/8/8/1n6/8/8/R3K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('prophylaxisDetector', () => {
  test('claims the fork square the move took away', () => {
    const [claim] = prophylaxisDetector.detect(buildTacticDetectionContext(KNIGHT_EYEING_A_FORK, 'Kf1', 'white'));

    expect(claim).toMatchObject({ type: 'prophylaxis', targets: ['c2'], gainKind: 'safety' });
  });

  test('says nothing when there was no knight fork to stop', () => {
    expect(prophylaxisDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
