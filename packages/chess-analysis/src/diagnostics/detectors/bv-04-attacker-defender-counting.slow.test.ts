import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { bv02OpponentHangingPieceBlindness } from './bv-02-opponent-hanging-piece-blindness.js';
import { bv04AttackerDefenderCountingFailure } from './bv-04-attacker-defender-counting.js';
import { detectorContext } from './test-context.js';

/** Rd7xd5 takes an "undefended" pawn, but the rook's own departure opens
 * the d-file for ...Rxd5: the one-ply count says favorable, SEE says −400. */
const XRAY_FEN = '3r2k1/3R4/8/3p4/8/8/8/6K1 w - - 0 1';
/** Rxa8+ looks favorable (rook for rook) and is an even trade after
 * ...Nxa8 (SEE 0). The h1 rook hangs to Qxh1 meanwhile. */
const EVEN_TRADE_FEN = 'r3k3/2n5/8/8/8/4K3/8/R2Q3r w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 0, cpAfter: -400 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 0, cpAfter: -10 };

describe('bv04AttackerDefenderCountingFailure', () => {
  test('fails when the miscounted exchange actually loses material and the eval confirms it', () => {
    const observation = bv04AttackerDefenderCountingFailure.detect(detectorContext(XRAY_FEN, 'Rxd5', LOSS));

    expect(observation).toMatchObject({ code: 'BV-04', direction: 'B', failed: true });
    expect(observation!.detail).toContain('the full exchange on d5 is losing (SEE -400)');
  });

  test('compensated: the same losing exchange without an eval loss is not failed', () => {
    expect(bv04AttackerDefenderCountingFailure.detect(detectorContext(XRAY_FEN, 'Rxd5', NO_LOSS))).toMatchObject({
      failed: false,
      hwdl: 0
    });
  });

  test('an even trade the count called favorable is not a failure, even when the move lost for another reason', () => {
    const observation = bv04AttackerDefenderCountingFailure.detect(detectorContext(EVEN_TRADE_FEN, 'Rxa8+', LOSS));

    expect(observation).toMatchObject({ failed: false });
    expect(observation!.detail).toContain('is even (SEE 0)');
  });

  test('no opportunity on a non-capture', () => {
    expect(bv04AttackerDefenderCountingFailure.detect(detectorContext(EVEN_TRADE_FEN, 'Kd3', LOSS))).toBeNull();
  });

  test('no opportunity when the one-ply count and the full exchange agree', () => {
    expect(bv04AttackerDefenderCountingFailure.detect(detectorContext(EVEN_TRADE_FEN, 'Qxh1', LOSS))).toBeNull();
  });

  test('does not suppress BV-02 firing on the same ply for a separate, genuinely free piece', () => {
    const ctx = detectorContext(EVEN_TRADE_FEN, 'Rxa8+', {
      quality: 'mistake',
      cpBefore: 500,
      cpAfter: 0,
      bestMoveSan: 'Qxh1',
      alternatives: [{ san: 'Rxa8+', cp: 0, winPct: 50 }]
    });

    expect(bv04AttackerDefenderCountingFailure.detect(ctx)).not.toBeNull();
    expect(bv02OpponentHangingPieceBlindness.detect(ctx)).toMatchObject({ code: 'BV-02', failed: true });
  });
});
