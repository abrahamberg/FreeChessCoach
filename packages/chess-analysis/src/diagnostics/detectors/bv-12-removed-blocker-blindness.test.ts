import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv12RemovedBlockerBlindness } from './bv-12-removed-blocker-blindness.js';
import { bv16SelfExposureBlindness } from './bv-16-self-exposure-blindness.js';

function playMove(fenBefore: string, moveSan: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
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
    fenBefore,
    fenAfter,
    ...overrides
  };
}

describe('bv12RemovedBlockerBlindness', () => {
  test('fires when the move vacates a blocking square and exposes any mover piece to a newly-revealed attack', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove('4k2b/8/8/8/3N4/8/8/R3K3 w - - 0 1', 'Nb3', '4k2b/8/8/8/8/1N6/8/R3K3 b - - 1 1')
    )!;

    const observation = bv12RemovedBlockerBlindness.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('BV-12');
    expect(observation!.direction).toBe('B');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the move opens no new line for the opponent', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove('4k2b/8/8/8/3N4/8/8/R3K3 w - - 0 1', 'Kd1', '4k2b/8/8/8/3N4/8/8/R2K4 b - - 1 1', {
        quality: 'best',
        cpLoss: 0,
        drop: 0
      })
    )!;

    expect(bv12RemovedBlockerBlindness.detect(ctx)).toBeNull();
  });

  test('does not suppress BV-16 firing on the same ply when the exposed piece is the queen', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove('4k2b/8/8/8/3N4/8/8/Q3K3 w - - 0 1', 'Nb3', '4k2b/8/8/8/8/1N6/8/Q3K3 b - - 1 1')
    )!;

    expect(bv12RemovedBlockerBlindness.detect(ctx)).not.toBeNull();
    expect(bv16SelfExposureBlindness.detect(ctx)).not.toBeNull();
  });
});
