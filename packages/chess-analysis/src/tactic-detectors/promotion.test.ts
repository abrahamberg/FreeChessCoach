import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { pawnBreakthroughDetector, promotionTacticDetector, underPromotionDetector } from './promotion.js';

const PAWN_ON_THE_SEVENTH = '8/P6k/8/8/8/8/8/7K w - - 0 1';
/** cxb6 takes the last black pawn off the queenside and leaves two passers. */
const BREAKTHROUGH = '4k3/8/1p6/2P5/1P6/8/8/4K3 w - - 0 1';
/** The same pawn walking forward into empty space: a space gain, not a
 * breakthrough. */
const QUIET_PUSH = '4k3/8/8/2P5/1P6/8/8/4K3 w - - 0 1';

describe('promotionTacticDetector', () => {
  test('prices the promotion as the swing, not the whole new piece', () => {
    const [claim] = promotionTacticDetector.detect(buildTacticDetectionContext(PAWN_ON_THE_SEVENTH, 'a8=Q', 'white'));

    expect(claim).toMatchObject({ type: 'promotionTactic', prize: 'queen', expectedGain: 8, gainKind: 'material' });
  });
});

describe('underPromotionDetector', () => {
  test('claims a promotion to anything but a queen', () => {
    const [claim] = underPromotionDetector.detect(buildTacticDetectionContext(PAWN_ON_THE_SEVENTH, 'a8=N', 'white'));

    expect(claim).toMatchObject({ type: 'underPromotion', prize: 'knight' });
  });

  test('says nothing about an ordinary queening', () => {
    expect(underPromotionDetector.detect(buildTacticDetectionContext(PAWN_ON_THE_SEVENTH, 'a8=Q', 'white'))).toEqual([]);
  });
});

describe('pawnBreakthroughDetector', () => {
  test('claims a pawn capture that leaves a passer behind', () => {
    const [claim] = pawnBreakthroughDetector.detect(buildTacticDetectionContext(BREAKTHROUGH, 'cxb6', 'white'));

    expect(claim).toMatchObject({ type: 'pawnBreakthrough', gainKind: 'positional' });
  });

  test('says nothing about a pawn walking into empty space', () => {
    // Without the sacrifice test one quiet move in twelve was a
    // "breakthrough" — a push that happens to create a passer is spaceGain.
    expect(pawnBreakthroughDetector.detect(buildTacticDetectionContext(QUIET_PUSH, 'c6', 'white'))).toEqual([]);
  });
});
