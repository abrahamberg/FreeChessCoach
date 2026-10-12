import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv01OwnHangingPieceBlindness } from './bv-01-own-hanging-piece-blindness.js';
import { detectorContext } from './test-context.js';

/** Qd1-d5 hangs the queen to the e6 pawn. Nothing hung before. */
const QUEEN_BLUNDER_FEN = '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1';
/** The queen already hangs on d5 before White moves. */
const QUEEN_ALREADY_HANGING_FEN = '4k3/8/4p3/3Q4/8/8/8/4K3 w - - 0 1';
/** Nd5 is defended by c4, so nothing hangs after it. */
const DEFENDED_KNIGHT_FEN = '4k3/8/5n2/8/2P5/2N5/8/4K3 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 0 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 880 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('bv01OwnHangingPieceBlindness', () => {
  test('fails when the refutation takes the piece the move left hanging', () => {
    const observation = bv01OwnHangingPieceBlindness.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', LOSS, ['exd5']));

    expect(observation).toMatchObject({ code: 'BV-01', direction: 'D', failed: true });
    expect(observation!.detail).toBe('left d5 hanging and lost it to exd5');
  });

  test('fails on the live path (no refutation) when the eval confirms the loss', () => {
    expect(bv01OwnHangingPieceBlindness.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', LOSS))?.failed).toBe(true);
  });

  test('no observation when the loss came from something other than the hanging piece', () => {
    expect(bv01OwnHangingPieceBlindness.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', LOSS, ['Kf8', 'Ke2']))).toBeNull();
  });

  test('a pre-existing hanging piece is not failed when the loss was something else', () => {
    const observation = bv01OwnHangingPieceBlindness.detect(contextFor(QUEEN_ALREADY_HANGING_FEN, 'Kd2', LOSS, ['Kf7', 'Qd3']));

    expect(observation).toMatchObject({ failed: false, hwdl: 0 });
  });

  test('compensated: hanging with no eval loss is no observation when nothing hung before', () => {
    expect(bv01OwnHangingPieceBlindness.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', NO_LOSS))).toBeNull();
  });

  test('compensated with a pre-move hanging piece: left hanging without an eval loss is a success', () => {
    const observation = bv01OwnHangingPieceBlindness.detect(contextFor(QUEEN_ALREADY_HANGING_FEN, 'Kd2', NO_LOSS));

    expect(observation).toMatchObject({ failed: false });
    expect(observation!.detail).toBe('had d5 hanging before the move and did not lose it');
  });

  test('rescuing a pre-move hanging piece is a success', () => {
    const observation = bv01OwnHangingPieceBlindness.detect(
      contextFor(QUEEN_ALREADY_HANGING_FEN, 'Qd1', { quality: 'best', cpBefore: 900, cpAfter: 900 })
    );

    expect(observation?.failed).toBe(false);
  });

  test('no opportunity when nothing hangs, even on a blunder', () => {
    expect(bv01OwnHangingPieceBlindness.detect(contextFor(DEFENDED_KNIGHT_FEN, 'Nd5', LOSS))).toBeNull();
  });
});
