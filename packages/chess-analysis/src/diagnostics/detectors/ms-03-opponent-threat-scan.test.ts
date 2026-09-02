import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms01OpponentCheckScanOmission } from './ms-01-opponent-check-scan.js';
import { ms03OpponentThreatScanOmission } from './ms-03-opponent-threat-scan.js';

const OPPONENT_HAS_CHECK_CAPTURE_THREAT_FEN = '3qk3/8/8/6Q1/8/1R6/8/4K3 b - - 0 1';
const NO_OPPONENT_OPPORTUNITIES_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 0 1';

function moveTo(fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Kd1',
    mover: 'white',
    isUserMove: true,
    cpLoss: 350,
    quality: 'blunder',
    bestLineSan: ['Kd1'],
    evalAfterCp: -400,
    hangsPiece: false,
    drop: 40,
    fenBefore: fenAfter,
    fenAfter,
    ...overrides
  };
}

describe('ms03OpponentThreatScanOmission', () => {
  test('fires when the opponent has a quiet newly-attacking threat available after the move', () => {
    const ctx = buildPlyDiagnosticContext(moveTo(OPPONENT_HAS_CHECK_CAPTURE_THREAT_FEN))!;

    const observation = ms03OpponentThreatScanOmission.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('MS-03');
    expect(observation!.direction).toBe('D');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the opponent has no threat available', () => {
    const ctx = buildPlyDiagnosticContext(moveTo(NO_OPPONENT_OPPORTUNITIES_FEN, { quality: 'blunder', drop: 40 }))!;

    expect(ms03OpponentThreatScanOmission.detect(ctx)).toBeNull();
  });

  test('does not suppress MS-01 firing on the same ply', () => {
    const ctx = buildPlyDiagnosticContext(moveTo(OPPONENT_HAS_CHECK_CAPTURE_THREAT_FEN))!;

    expect(ms03OpponentThreatScanOmission.detect(ctx)).not.toBeNull();
    expect(ms01OpponentCheckScanOmission.detect(ctx)).not.toBeNull();
  });
});
