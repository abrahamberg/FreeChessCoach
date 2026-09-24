import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv12RemovedBlockerBlindness } from './bv-12-removed-blocker-blindness.js';
import { bv16SelfExposureBlindness } from './bv-16-self-exposure-blindness.js';
import { detectorContext } from './test-context.js';

/** Nd4-b3 opens the long diagonal onto the a1 queen. */
const QUEEN_EXPOSED_FEN = '4k2b/8/8/8/3N4/8/8/Q3K3 w - - 0 1';
/** The same move exposing only a rook. */
const ROOK_EXPOSED_FEN = '4k2b/8/8/8/3N4/8/8/R3K3 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 300 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 880 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('bv16SelfExposureBlindness', () => {
  test('fails when the refutation captures the exposed queen', () => {
    const observation = bv16SelfExposureBlindness.detect(contextFor(QUEEN_EXPOSED_FEN, 'Nb3', LOSS, ['Bxa1', 'Nxa1']));

    expect(observation).toMatchObject({ code: 'BV-16', direction: 'B', failed: true });
    expect(observation!.detail).toContain("own queen on a1 to the opponent's b on h8");
  });

  test('without a refutation, fails on the static SEE when the eval confirms the loss', () => {
    expect(bv16SelfExposureBlindness.detect(contextFor(QUEEN_EXPOSED_FEN, 'Nb3', LOSS))?.failed).toBe(true);
  });

  test('not failed when the refutation leaves the exposure alone', () => {
    expect(bv16SelfExposureBlindness.detect(contextFor(QUEEN_EXPOSED_FEN, 'Nb3', LOSS, ['Kd7', 'Kd2']))?.failed).toBe(false);
  });

  test('compensated: the same exposure without an eval loss is not failed', () => {
    expect(bv16SelfExposureBlindness.detect(contextFor(QUEEN_EXPOSED_FEN, 'Nb3', NO_LOSS))).toMatchObject({ failed: false, hwdl: 0 });
  });

  test('no opportunity when the exposed piece is not the king or queen', () => {
    expect(bv16SelfExposureBlindness.detect(contextFor(ROOK_EXPOSED_FEN, 'Nb3', LOSS))).toBeNull();
  });

  test('does not suppress BV-12 firing on the same ply', () => {
    const ctx = contextFor(QUEEN_EXPOSED_FEN, 'Nb3', LOSS, ['Bxa1', 'Nxa1']);

    expect(bv16SelfExposureBlindness.detect(ctx)?.failed).toBe(true);
    expect(bv12RemovedBlockerBlindness.detect(ctx)?.failed).toBe(true);
  });
});
