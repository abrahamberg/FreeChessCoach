import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv02OpponentHangingPieceBlindness } from './bv-02-opponent-hanging-piece-blindness.js';
import { bv04AttackerDefenderCountingFailure } from './bv-04-attacker-defender-counting.js';

const MISCOUNT_FEN = 'r3k3/2n5/8/8/8/4K3/8/R2Q3r w - - 0 1';

function playMove(moveSan: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan,
    mover: 'white',
    isUserMove: true,
    cpLoss: 200,
    quality: 'mistake',
    bestLineSan: [moveSan],
    evalAfterCp: -200,
    hangsPiece: false,
    drop: 20,
    fenBefore: MISCOUNT_FEN,
    fenAfter,
    checksCapturesThreats: analyzeChecksCapturesThreats(MISCOUNT_FEN),
    ...overrides
  };
}

describe('bv04AttackerDefenderCountingFailure', () => {
  test('fires when the one-ply favorable flag disagrees with the full exchange evaluation', () => {
    const ctx = buildPlyDiagnosticContext(playMove('Rxa8+', 'R3k3/2n5/8/8/8/4K3/8/3Q3r b - - 0 1'))!;

    const observation = bv04AttackerDefenderCountingFailure.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('BV-04');
    expect(observation!.direction).toBe('B');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire on a non-capture move', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove('Kd3', 'r3k3/2n5/8/8/8/8/3K4/R2Q3r b - - 1 1', { quality: 'best', cpLoss: 0, drop: 0 })
    )!;

    expect(bv04AttackerDefenderCountingFailure.detect(ctx)).toBeNull();
  });

  test('does not suppress BV-02 firing on the same ply for a separate, genuinely free piece', () => {
    const ctx = buildPlyDiagnosticContext(playMove('Rxa8+', 'R3k3/2n5/8/8/8/4K3/8/3Q3r b - - 0 1'))!;

    expect(bv04AttackerDefenderCountingFailure.detect(ctx)).not.toBeNull();
    expect(bv02OpponentHangingPieceBlindness.detect(ctx)).not.toBeNull();
  });
});
