import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv22LoosePieceInventoryFailure } from './bv-22-loose-piece-inventory.js';
import { detectorContext } from './test-context.js';

/** After Kh1, the c3 rook and f3 knight are each attacked twice and
 * defended once by a pawn: two simultaneous loose pieces. */
const TWO_LOOSE_FEN = '4k3/8/8/3nn3/1b4b1/2R1PN2/PP4P1/6K1 w - - 0 1';
/** The same without the f3 knight: only the c3 rook is loose. */
const ONE_LOOSE_FEN = '4k3/8/8/3nn3/1b4b1/2R1P3/PP4P1/6K1 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 0, cpAfter: -300 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 0, cpAfter: -10 };

function contextFor(fenBefore: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, 'Kh1', overrides, { refutation });
}

describe('bv22LoosePieceInventoryFailure', () => {
  test('fails when the refutation wins one of the loose pieces', () => {
    const observation = bv22LoosePieceInventoryFailure.detect(contextFor(TWO_LOOSE_FEN, LOSS, ['Nxc3', 'bxc3', 'Bxc3']));

    expect(observation).toMatchObject({ code: 'BV-22', direction: 'B', failed: true });
    expect(observation!.detail).toBe('left 2 simultaneous loose pieces: c3, f3; lost one to Nxc3 / Bxc3');
  });

  test('fails on the live path (no refutation) when the eval confirms the loss', () => {
    expect(bv22LoosePieceInventoryFailure.detect(contextFor(TWO_LOOSE_FEN, LOSS))?.failed).toBe(true);
  });

  test('not failed when the refutation leaves the loose pieces alone', () => {
    expect(bv22LoosePieceInventoryFailure.detect(contextFor(TWO_LOOSE_FEN, LOSS, ['Kd7', 'a3']))?.failed).toBe(false);
  });

  test('compensated: loose pieces without an eval loss are not failed', () => {
    expect(bv22LoosePieceInventoryFailure.detect(contextFor(TWO_LOOSE_FEN, NO_LOSS))).toMatchObject({ failed: false, hwdl: 0 });
  });

  test('no opportunity with a single loose piece', () => {
    expect(bv22LoosePieceInventoryFailure.detect(contextFor(ONE_LOOSE_FEN, LOSS))).toBeNull();
  });
});
