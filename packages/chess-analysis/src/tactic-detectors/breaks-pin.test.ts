import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { breaksPinDetector } from './breaks-pin.js';

/** White's bishop on b5 pins the c6 knight against the king on e8; ...Bd7
 * interposes and the knight is free again. */
const PINNED_KNIGHT = '2b1k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1';
/** The same pin, but the black bishop can simply take the pinner. */
const PINNER_HANGING = '4k3/8/2n5/1B6/8/6b1/8/4K3 b - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('breaksPinDetector', () => {
  test('claims the pin that this move broke', () => {
    const [claim, ...rest] = breaksPinDetector.detect(buildTacticDetectionContext(PINNED_KNIGHT, 'Bd7', 'black'));

    expect(rest).toEqual([]);
    expect(claim).toMatchObject({ type: 'breaksPin', actor: 'd7', targets: ['c6'], gainKind: 'safety' });
  });

  test('names the freed piece without a possessive', () => {
    // The freed piece is the mover's own, and the sentence around this detail
    // already names them — "their knight" put the wrong side's word on it.
    const [claim] = breaksPinDetector.detect(buildTacticDetectionContext(PINNED_KNIGHT, 'Bd7', 'black'));

    expect(claim?.detail).toBe('the knight on c6 is free to move again');
  });

  test('says nothing when the move simply captures the pinning piece', () => {
    // Taking the pinner is a capture, and the capture is the card — without
    // this rule every recapture in the game "breaks a pin".
    expect(breaksPinDetector.detect(buildTacticDetectionContext(PINNER_HANGING, 'Bxb5', 'black'))).toEqual([]);
  });

  test('does not flag a quiet developing move', () => {
    expect(breaksPinDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
