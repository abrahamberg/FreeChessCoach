import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { ms02OpponentCaptureScanOmission } from './ms-02-opponent-capture-scan.js';
import { detectorContext } from './test-context.js';

/** Qd1-d5 puts the queen en prise to the e6 pawn. Nothing hung before. */
const QUEEN_BLUNDER_FEN = '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1';
/** The queen already stands en prise on d5 before White moves. */
const QUEEN_ALREADY_HANGING_FEN = '4k3/8/4p3/3Q4/8/8/8/4K3 w - - 0 1';
/** Nd5 is defended by c4: ...Nxd5 cxd5 is an even trade. */
const DEFENDED_KNIGHT_FEN = '4k3/8/5n2/8/2P5/2N5/8/4K3 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 0 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 900, cpAfter: 880 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('ms02OpponentCaptureScanOmission', () => {
  test('fails when the refutation takes the piece left en prise', () => {
    const observation = ms02OpponentCaptureScanOmission.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', LOSS, ['exd5']));

    expect(observation).toMatchObject({ code: 'MS-02', direction: 'D', failed: true, severity: 'decisive' });
    expect(observation!.detail).toContain('exd5 (on d5)');
  });

  test('fails on the live path (no refutation) when the eval confirms the loss', () => {
    expect(ms02OpponentCaptureScanOmission.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', LOSS))?.failed).toBe(true);
  });

  test('no observation when the refutation never takes the piece (the loss was something else)', () => {
    expect(ms02OpponentCaptureScanOmission.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', LOSS, ['Kf8', 'Ke2']))).toBeNull();
  });

  test('compensated: the same capture left standing without an eval loss is no observation (no pre-move threat)', () => {
    expect(ms02OpponentCaptureScanOmission.detect(contextFor(QUEEN_BLUNDER_FEN, 'Qd5', NO_LOSS))).toBeNull();
  });

  test('compensated with a pre-move threat: left standing without an eval loss is a success', () => {
    const observation = ms02OpponentCaptureScanOmission.detect(contextFor(QUEEN_ALREADY_HANGING_FEN, 'Kd2', NO_LOSS));

    expect(observation).toMatchObject({ failed: false, hwdl: 0 });
    expect(observation!.detail).toContain('exd5');
  });

  test('a pre-move threat the move answers is a success', () => {
    const observation = ms02OpponentCaptureScanOmission.detect(
      contextFor(QUEEN_ALREADY_HANGING_FEN, 'Qd1', { quality: 'best', cpBefore: 900, cpAfter: 900 })
    );

    expect(observation?.failed).toBe(false);
  });

  test('no opportunity for a capture that only trades, even on a blunder', () => {
    expect(ms02OpponentCaptureScanOmission.detect(contextFor(DEFENDED_KNIGHT_FEN, 'Nd5', LOSS))).toBeNull();
  });

  test('a legacy move without evals falls back to its quality', () => {
    const legacy = contextFor(QUEEN_BLUNDER_FEN, 'Qd5', { quality: 'blunder', drop: 40 });

    expect(ms02OpponentCaptureScanOmission.detect(legacy)).toMatchObject({ failed: true, severity: 'decisive', hwdl: 0.4 });
  });
});
