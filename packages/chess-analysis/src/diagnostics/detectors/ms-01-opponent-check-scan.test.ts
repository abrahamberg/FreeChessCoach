import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { ms01OpponentCheckScanOmission } from './ms-01-opponent-check-scan.js';
import { detectorContext } from './test-context.js';

/** Kh1-g1 walks into ...Nf3+, forking the king and the h2 queen. No
 * knight check existed with the king on h1. */
const FORK_FEN = '6k1/8/8/4n3/8/8/7Q/7K w - - 0 1';
/** Back rank: ...Ra1# is threatened before White moves. */
const BACK_RANK_FEN = 'r5k1/5ppp/8/8/8/8/5PPP/7K w - - 0 1';
/** Only a lone rook check exists, hitting nothing. */
const HARMLESS_CHECK_FEN = '4r1k1/8/8/8/8/8/8/7K w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 600, cpAfter: -300 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'blunder', cpBefore: 600, cpAfter: 590 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('ms01OpponentCheckScanOmission', () => {
  test('fails when a dangerous check is left standing and the refutation plays it', () => {
    const observation = ms01OpponentCheckScanOmission.detect(contextFor(FORK_FEN, 'Kg1', LOSS, ['Nf3+', 'Kf1', 'Nxh2+']));

    expect(observation).toMatchObject({ code: 'MS-01', direction: 'D', failed: true });
    expect(observation!.detail).toContain('Nf3+');
    expect(observation!.hwdl).toBeGreaterThan(0);
  });

  test('fails on the live path (no refutation) when the eval confirms the loss', () => {
    expect(ms01OpponentCheckScanOmission.detect(contextFor(FORK_FEN, 'Kg1', LOSS))?.failed).toBe(true);
  });

  test('no observation when the loss came from a line that never plays the check', () => {
    expect(ms01OpponentCheckScanOmission.detect(contextFor(FORK_FEN, 'Kg1', LOSS, ['Kf7', 'Qh7+']))).toBeNull();
  });

  test('compensated: the same check left standing without an eval loss is no observation (no pre-move threat)', () => {
    expect(ms01OpponentCheckScanOmission.detect(contextFor(FORK_FEN, 'Kg1', NO_LOSS))).toBeNull();
  });

  test('a mate threat before the move that the move defuses is a success', () => {
    const observation = ms01OpponentCheckScanOmission.detect(contextFor(BACK_RANK_FEN, 'h3', { quality: 'best', cpBefore: -100, cpAfter: -100 }));

    expect(observation).toMatchObject({ code: 'MS-01', failed: false, hwdl: 0 });
    expect(observation!.detail).toContain('Ra1#');
  });

  test('no opportunity for a check that threatens nothing, even on a blunder', () => {
    expect(ms01OpponentCheckScanOmission.detect(contextFor(HARMLESS_CHECK_FEN, 'Kg1', LOSS))).toBeNull();
  });
});
