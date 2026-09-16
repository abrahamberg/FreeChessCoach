import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { removesTargetDetector } from './removes-target.js';

/** Black's knight on c3 hangs to the rook on c1; ...Nd5 steps out of reach. */
const ATTACKED_KNIGHT = '4k3/8/8/8/8/2n5/8/2R1K3 b - - 0 1';
/** The same idea with a pawn, which is not a card. */
const ATTACKED_PAWN = '4k3/8/8/8/8/2p5/8/2R1K3 b - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('removesTargetDetector', () => {
  test('claims a piece moved out of reach', () => {
    const [claim] = removesTargetDetector.detect(buildTacticDetectionContext(ATTACKED_KNIGHT, 'Nd5', 'black'));

    expect(claim).toMatchObject({ type: 'removesTarget', actor: 'd5', targets: ['c3'], gainKind: 'safety' });
  });

  test('says nothing about a pawn stepping aside', () => {
    expect(removesTargetDetector.detect(buildTacticDetectionContext(ATTACKED_PAWN, 'c2', 'black'))).toEqual([]);
  });

  test('does not flag a quiet developing move', () => {
    expect(removesTargetDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
