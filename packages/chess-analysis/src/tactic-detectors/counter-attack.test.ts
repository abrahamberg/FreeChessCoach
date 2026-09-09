import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { counterAttackDetector } from './counter-attack.js';

/** White's bishop on a1 hangs to the rook on a8. Rh3 leaves it there and hits
 * the other rook instead. */
const HANGING_BISHOP = 'r3k2r/8/8/8/8/3R4/8/B3K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('counterAttackDetector', () => {
  test('claims the counter-threat and the piece still hanging behind it', () => {
    const [claim] = counterAttackDetector.detect(buildTacticDetectionContext(HANGING_BISHOP, 'Rh3', 'white'));

    expect(claim).toMatchObject({ type: 'counterAttack', actor: 'h3', targets: ['h8', 'a1'], gainKind: 'safety' });
  });

  test('does not flag a quiet developing move', () => {
    expect(counterAttackDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
