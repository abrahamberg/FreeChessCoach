import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { ms03OpponentThreatScanOmission } from './ms-03-opponent-threat-scan.js';
import { detectorContext } from './test-context.js';

/** Nb3-d4 lets ...e5 hit the knight from a square nothing covers. */
const KNIGHT_INTO_PAWN_FEN = '4k3/8/4p3/8/8/1N6/8/4K3 w - - 0 1';
/** The knight already sits on d4, where ...e5 would hit it: a threat to
 * make a threat, not a direct one. */
const KNIGHT_ALREADY_EXPOSED_FEN = '4k3/8/4p3/8/3N4/8/8/4K3 w - - 0 1';
/** Black threatens ...Ra1# against the boxed-in king. */
const BACK_RANK_MATE_THREAT_FEN = 'r3k3/8/8/8/3N4/8/5PPP/6K1 w - - 0 1';
/** Black threatens ...b1=Q, and nothing of White's covers b1. */
const PROMOTION_THREAT_FEN = '4k3/8/8/8/4N3/8/1p6/6K1 w - - 0 1';
/** No black pawn: nothing can threaten the knight on d4. */
const NO_THREAT_FEN = '4k3/8/8/8/8/1N6/8/4K3 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 300, cpAfter: 0 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 300, cpAfter: 290 };

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, refutation?: string[]) {
  return detectorContext(fenBefore, moveSan, overrides, { refutation });
}

describe('ms03OpponentThreatScanOmission', () => {
  test('fails when the refutation plays the threat', () => {
    const observation = ms03OpponentThreatScanOmission.detect(contextFor(KNIGHT_INTO_PAWN_FEN, 'Nd4', LOSS, ['e5', 'Kd2', 'exd4']));

    expect(observation).toMatchObject({ code: 'MS-03', direction: 'D', failed: true });
    expect(observation!.detail).toContain('e5 (on d4)');
  });

  test('fails on the live path (no refutation) when the eval confirms the loss', () => {
    expect(ms03OpponentThreatScanOmission.detect(contextFor(KNIGHT_INTO_PAWN_FEN, 'Nd4', LOSS))?.failed).toBe(true);
  });

  test('no observation when the threatened piece simply escapes in the refutation', () => {
    expect(ms03OpponentThreatScanOmission.detect(contextFor(KNIGHT_INTO_PAWN_FEN, 'Nd4', LOSS, ['e5', 'Nb5', 'Kd7']))).toBeNull();
  });

  test('no observation when the refutation never touches the threat', () => {
    expect(ms03OpponentThreatScanOmission.detect(contextFor(KNIGHT_INTO_PAWN_FEN, 'Nd4', LOSS, ['Kd7', 'Kd2']))).toBeNull();
  });

  test('compensated: the threat left standing without an eval loss is no observation (no pre-move threat)', () => {
    expect(ms03OpponentThreatScanOmission.detect(contextFor(KNIGHT_INTO_PAWN_FEN, 'Nd4', NO_LOSS))).toBeNull();
  });

  test('a quiet attack the opponent could make next is not a direct threat to answer', () => {
    expect(ms03OpponentThreatScanOmission.detect(contextFor(KNIGHT_ALREADY_EXPOSED_FEN, 'Nb3', NO_LOSS))).toBeNull();
  });

  test('a mate-in-one threat the move answers is a success', () => {
    const observation = ms03OpponentThreatScanOmission.detect(contextFor(BACK_RANK_MATE_THREAT_FEN, 'h3', NO_LOSS));

    expect(observation).toMatchObject({ failed: false, hwdl: 0 });
    expect(observation!.detail).toContain('Ra1# (on a1)');
  });

  test('a promotion threat the move answers is a success', () => {
    const observation = ms03OpponentThreatScanOmission.detect(contextFor(PROMOTION_THREAT_FEN, 'Nd2', NO_LOSS));

    expect(observation).toMatchObject({ failed: false });
    expect(observation!.detail).toContain('b1=Q');
  });

  test('no opportunity when there is no threat at all, even on a mistake', () => {
    expect(ms03OpponentThreatScanOmission.detect(contextFor(NO_THREAT_FEN, 'Nd4', LOSS))).toBeNull();
  });
});
