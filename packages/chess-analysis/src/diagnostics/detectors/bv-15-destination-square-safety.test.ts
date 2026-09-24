import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv15DestinationSquareSafetyBlindness } from './bv-15-destination-square-safety.js';
import { detectorContext } from './test-context.js';

/** Qf1-f6 lands the queen where the g7 pawn takes it. */
const QUEEN_INTO_PAWN_FEN = '4k3/6p1/8/8/8/8/8/4KQ2 w - - 0 1';
/** f5-f6 is attacked by the g7 pawn but defended by e5: ...gxf6 exf6 is even. */
const DEFENDED_PAWN_FEN = '4k3/6p1/8/4PP2/8/8/8/4K3 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 0 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 880 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('bv15DestinationSquareSafetyBlindness', () => {
  test('fails when the refutation captures the piece on its destination', () => {
    const observation = bv15DestinationSquareSafetyBlindness.detect(contextFor(QUEEN_INTO_PAWN_FEN, 'Qf6', LOSS, ['gxf6']));

    expect(observation).toMatchObject({ code: 'BV-15', direction: 'B', failed: true });
    expect(observation!.detail).toContain('landed on f6, where the opponent won the piece (SEE 900');
  });

  test('fails on the live path (no refutation) on the static SEE when the eval confirms the loss', () => {
    expect(bv15DestinationSquareSafetyBlindness.detect(contextFor(QUEEN_INTO_PAWN_FEN, 'Qf6', LOSS))?.failed).toBe(true);
  });

  test('not failed when the refutation never captures on the destination', () => {
    expect(bv15DestinationSquareSafetyBlindness.detect(contextFor(QUEEN_INTO_PAWN_FEN, 'Qf6', LOSS, ['Kd7', 'Qxg7+']))?.failed).toBe(false);
  });

  test('compensated: landing en prise without an eval loss is not failed', () => {
    expect(bv15DestinationSquareSafetyBlindness.detect(contextFor(QUEEN_INTO_PAWN_FEN, 'Qf6', NO_LOSS))).toMatchObject({ failed: false, hwdl: 0 });
  });

  test('an attacked but defended destination is an opportunity that does not fail, even on a loss', () => {
    const observation = bv15DestinationSquareSafetyBlindness.detect(contextFor(DEFENDED_PAWN_FEN, 'f6', LOSS));

    expect(observation).toMatchObject({ failed: false });
    expect(observation!.detail).toContain('attacked by the opponent but safe');
  });

  test('no opportunity when the destination is not attacked', () => {
    expect(bv15DestinationSquareSafetyBlindness.detect(contextFor(QUEEN_INTO_PAWN_FEN, 'Qa6', LOSS))).toBeNull();
  });
});
