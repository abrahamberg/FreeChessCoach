import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { xRayAttackDetector } from './x-ray-attack.js';

/** Re1 lines the rook up behind its own e4 pawn at the black rook on e8. */
const BATTERY_AVAILABLE = '4r3/5k2/8/8/4P3/8/8/R4K2 w - - 0 1';
/** The same shape aimed at a knight, which is not worth the sentence: a
 * bishop behind its own pawn at a minor piece describes half the openings
 * ever played. */
const AIMED_AT_A_KNIGHT = '4n3/5k2/8/8/4P3/8/8/R4K2 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('xRayAttackDetector', () => {
  test('claims the piece in front and the one it screens', () => {
    const [claim] = xRayAttackDetector.detect(buildTacticDetectionContext(BATTERY_AVAILABLE, 'Re1', 'white'));

    expect(claim).toMatchObject({ type: 'xRayAttack', actor: 'e1', targets: ['e4', 'e8'], gainKind: 'positional' });
  });

  test('says nothing when what is screened is only a minor piece', () => {
    expect(xRayAttackDetector.detect(buildTacticDetectionContext(AIMED_AT_A_KNIGHT, 'Re1', 'white'))).toEqual([]);
  });

  test('does not flag a quiet developing move', () => {
    expect(xRayAttackDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
