import type { ClassifiedMoveDto, FeatureDeltaDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv10LastMoveBoardUpdateFailure } from './bv-10-last-move-board-update.js';
import { detectorContext } from './test-context.js';

/** Black just played ...e7-e6, attacking the white queen on d5. */
const AFTER_E6_FEN = '4k3/8/4p3/3Q4/8/8/8/4K3 w - - 0 2';
const HUNG_QUEEN = { square: 'd5', piece: 'q' as const, color: 'white' as const, attackers: 1, defenders: 0 };

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 0 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 880 };

function previousMove(newHangingPieces: FeatureDeltaDto['newHangingPieces']): ClassifiedMoveDto {
  return {
    ply: 0,
    moveSan: 'e6',
    mover: 'black',
    isUserMove: false,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['e6'],
    evalAfterCp: 900,
    hangsPiece: false,
    fenBefore: '4k3/4p3/8/3Q4/8/8/8/4K3 b - - 0 1',
    fenAfter: AFTER_E6_FEN,
    featureDelta: { newForks: [], newHangingPieces, mobilityDelta: 0 }
  };
}

function contextFor(moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[], hung = [HUNG_QUEEN]) {
  return detectorContext(AFTER_E6_FEN, moveSan, overrides, { refutation, previousMove: previousMove(hung) });
}

describe('bv10LastMoveBoardUpdateFailure', () => {
  test('fails when the piece the opponent just hit is still hanging and the refutation takes it', () => {
    const observation = bv10LastMoveBoardUpdateFailure.detect(contextFor('Kd2', LOSS, ['exd5']));

    expect(observation).toMatchObject({ code: 'BV-10', direction: 'B', failed: true });
    expect(observation!.detail).toContain('newly hung d5');
    expect(observation!.detail).toContain('lost to exd5');
  });

  test('fails on the live path (no refutation) when the eval confirms the loss', () => {
    expect(bv10LastMoveBoardUpdateFailure.detect(contextFor('Kd2', LOSS))?.failed).toBe(true);
  });

  test('not failed when the loss came from a line that leaves the piece alone', () => {
    expect(bv10LastMoveBoardUpdateFailure.detect(contextFor('Kd2', LOSS, ['Kf7', 'Qd3']))?.failed).toBe(false);
  });

  test('compensated: still hanging without an eval loss is not failed', () => {
    expect(bv10LastMoveBoardUpdateFailure.detect(contextFor('Kd2', NO_LOSS))).toMatchObject({ failed: false, hwdl: 0 });
  });

  test('no opportunity when the move addressed the newly hung piece', () => {
    expect(bv10LastMoveBoardUpdateFailure.detect(contextFor('Qd1', LOSS))).toBeNull();
  });

  test('no opportunity when the opponent\'s last move hung nothing of ours', () => {
    expect(bv10LastMoveBoardUpdateFailure.detect(contextFor('Kd2', LOSS, undefined, []))).toBeNull();
  });

  test('no opportunity without a previousMove (unknown history)', () => {
    expect(bv10LastMoveBoardUpdateFailure.detect(detectorContext(AFTER_E6_FEN, 'Kd2', LOSS))).toBeNull();
  });
});
