import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv15DestinationSquareSafetyBlindness } from './bv-15-destination-square-safety.js';
import { ms08DestinationSafetyOmission } from './ms-08-destination-safety.js';

const FEN_BEFORE = '4k3/6p1/8/8/8/8/8/4KQ2 w - - 0 1';

function playMove(moveSan: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan,
    mover: 'white',
    isUserMove: true,
    cpLoss: 900,
    quality: 'blunder',
    bestLineSan: [moveSan],
    evalAfterCp: -900,
    hangsPiece: true,
    drop: 90,
    fenBefore: FEN_BEFORE,
    fenAfter,
    ...overrides
  };
}

describe('bv15DestinationSquareSafetyBlindness', () => {
  test('fires when the move lands on a square the opponent can profitably capture', () => {
    const ctx = buildPlyDiagnosticContext(playMove('Qf6', '4k3/6p1/5Q2/8/8/8/8/4K3 b - - 1 1'))!;

    const observation = bv15DestinationSquareSafetyBlindness.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('BV-15');
    expect(observation!.direction).toBe('B');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the destination square is safe', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove('Qf4', '4k3/6p1/8/8/5Q2/8/8/4K3 b - - 1 1', { quality: 'best', cpLoss: 0, drop: 0, hangsPiece: false })
    )!;

    expect(bv15DestinationSquareSafetyBlindness.detect(ctx)).toBeNull();
  });

  test('does not suppress MS-08 firing on the same ply', () => {
    const ctx = buildPlyDiagnosticContext(playMove('Qf6', '4k3/6p1/5Q2/8/8/8/8/4K3 b - - 1 1'))!;

    expect(bv15DestinationSquareSafetyBlindness.detect(ctx)).not.toBeNull();
    expect(ms08DestinationSafetyOmission.detect(ctx)).not.toBeNull();
  });
});
