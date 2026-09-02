import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms07AutomaticRecaptureReflex } from './ms-07-automatic-recapture-reflex.js';
import { ms08DestinationSafetyOmission } from './ms-08-destination-safety.js';

const PREVIOUS_MOVE_FEN_BEFORE = '4k3/3r4/8/3N4/8/8/8/4K3 b - - 0 1';

function previousCapture(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Rxd5',
    mover: 'black',
    isUserMove: false,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['Rxd5'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: PREVIOUS_MOVE_FEN_BEFORE,
    fenAfter: '4k3/8/8/3r4/8/8/8/4K3 w - - 0 2',
    ...overrides
  };
}

function recapture(fenBefore: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 2,
    moveSan: 'Bxd5',
    mover: 'white',
    isUserMove: true,
    cpLoss: 200,
    quality: 'mistake',
    bestLineSan: ['Bxd5'],
    evalAfterCp: -200,
    hangsPiece: false,
    drop: 25,
    fenBefore,
    fenAfter,
    checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore),
    ...overrides
  };
}

describe('ms07AutomaticRecaptureReflex', () => {
  test('fires when the mover recaptures on the just-captured square while a stronger intermediate move (a check) went unplayed', () => {
    const fenBefore = '4k3/8/8/3r4/8/1B6/8/R3K2R w KQ - 0 1';
    const fenAfter = '4k3/8/8/3B4/8/8/8/R3K2R b KQ - 0 1';
    const ctx = buildPlyDiagnosticContext(recapture(fenBefore, fenAfter), { previousMove: previousCapture() })!;

    const observation = ms07AutomaticRecaptureReflex.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('MS-07');
    expect(observation!.direction).toBe('N');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when no stronger intermediate move existed', () => {
    const fenBefore = '4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 1';
    const fenAfter = '4k3/8/8/3P4/8/8/8/4K3 b - - 0 1';
    const ctx = buildPlyDiagnosticContext(recapture(fenBefore, fenAfter, { moveSan: 'cxd5' }), {
      previousMove: previousCapture()
    })!;

    expect(ms07AutomaticRecaptureReflex.detect(ctx)).toBeNull();
  });

  test('does not fire without a previousMove (unknown history)', () => {
    const fenBefore = '4k3/8/8/3r4/8/1B6/8/R3K2R w KQ - 0 1';
    const fenAfter = '4k3/8/8/3B4/8/8/8/R3K2R b KQ - 0 1';
    const ctx = buildPlyDiagnosticContext(recapture(fenBefore, fenAfter))!;

    expect(ms07AutomaticRecaptureReflex.detect(ctx)).toBeNull();
  });

  test('does not suppress MS-08 firing on the same ply when the recapture also lands unsafely', () => {
    const fenBefore = '4k3/8/4p3/3r4/8/1B6/8/R3K2R w KQ - 0 1';
    const fenAfter = '4k3/8/4p3/3B4/8/8/8/R3K2R b KQ - 0 1';
    const ctx = buildPlyDiagnosticContext(recapture(fenBefore, fenAfter), { previousMove: previousCapture() })!;

    expect(ms07AutomaticRecaptureReflex.detect(ctx)).not.toBeNull();
    expect(ms08DestinationSafetyOmission.detect(ctx)).not.toBeNull();
  });
});
