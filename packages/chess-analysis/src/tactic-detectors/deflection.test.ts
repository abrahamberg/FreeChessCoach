import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { deflectionDetector } from './deflection.js';

/** The knight on d7 is the only guard of both the b8 queen (hit by Rb1) and
 * the f6 bishop (hit by Rf1). Rc7 attacks the knight itself, so it has to
 * abandon one of them. */
const OVERLOADED_KNIGHT = '1q5k/3n4/5b2/8/8/8/4K3/1RR2R2 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('deflectionDetector', () => {
  test('claims the piece the deflected defender has to leave behind', () => {
    const [claim] = deflectionDetector.detect(buildTacticDetectionContext(OVERLOADED_KNIGHT, 'Rc7', 'white'));

    expect(claim).toMatchObject({ type: 'deflection', actor: 'c7', victim: 'b8', prize: 'queen', gainKind: 'material' });
  });

  test('does not flag a quiet developing move', () => {
    expect(deflectionDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
