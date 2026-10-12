import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv12RemovedBlockerBlindness } from './bv-12-removed-blocker-blindness.js';
import { detectorContext } from './test-context.js';

/** Nd4-b3 opens the long diagonal: the h8 bishop now hits the a1 rook
 * (defended only by the knight, so ...Bxa1 Nxa1 still wins the exchange). */
const ROOK_EXPOSED_FEN = '4k2b/8/8/8/3N4/8/8/R3K3 w - - 0 1';
/** Nd4-b3 revealing only the b2 pawn, which the c1 king defends: not winnable. */
const PAWN_EXPOSED_FEN = '4k2b/8/8/8/3N4/8/1P6/2K5 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 300, cpAfter: 100 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 300, cpAfter: 290 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('bv12RemovedBlockerBlindness', () => {
  test('fails when the refutation starts with the revealed piece', () => {
    const observation = bv12RemovedBlockerBlindness.detect(contextFor(ROOK_EXPOSED_FEN, 'Nb3', LOSS, ['Bxa1', 'Nxa1']));

    expect(observation).toMatchObject({ code: 'BV-12', direction: 'B', failed: true });
    expect(observation!.detail).toContain("opponent's b on h8, newly attacking a1");
  });

  test('not failed when the refutation neither moves the revealing piece nor captures on the revealed square', () => {
    expect(bv12RemovedBlockerBlindness.detect(contextFor(ROOK_EXPOSED_FEN, 'Nb3', LOSS, ['Kd7', 'Kd2']))?.failed).toBe(false);
  });

  test('without a refutation, a statically winnable revealed piece fails on an eval loss', () => {
    expect(bv12RemovedBlockerBlindness.detect(contextFor(ROOK_EXPOSED_FEN, 'Nb3', LOSS))?.failed).toBe(true);
  });

  test('without a refutation, a revealed piece that cannot be won does not fail', () => {
    expect(bv12RemovedBlockerBlindness.detect(contextFor(PAWN_EXPOSED_FEN, 'Nb3', LOSS))?.failed).toBe(false);
  });

  test('compensated: the same exposure without an eval loss is not failed', () => {
    expect(bv12RemovedBlockerBlindness.detect(contextFor(ROOK_EXPOSED_FEN, 'Nb3', NO_LOSS, ['Bxa1', 'Nxa1']))).toMatchObject({
      failed: false,
      hwdl: 0
    });
  });

  test('no opportunity when the move opens no new line for the opponent', () => {
    expect(bv12RemovedBlockerBlindness.detect(contextFor(ROOK_EXPOSED_FEN, 'Kd1', LOSS))).toBeNull();
  });
});
