import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms05OwnCaptureGenerationOmission } from './ms-05-own-capture-generation.js';
import { ms06OwnThreatGenerationOmission } from './ms-06-own-threat-generation.js';

const OWN_HAS_CHECK_CAPTURE_THREAT_FEN = '4k3/8/1r6/8/6q1/8/8/3QK3 w - - 0 1';
const OWN_HAS_CHECK_CAPTURE_THREAT_AFTER_FEN = '4k3/8/1r6/8/6q1/8/8/3Q1K2 b - - 1 1';
const NO_OWN_OPPORTUNITIES_FEN = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
const NO_OWN_OPPORTUNITIES_AFTER_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 0 1';

function playQuietMove(fenBefore: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Kf1',
    mover: 'white',
    isUserMove: true,
    cpLoss: 350,
    quality: 'blunder',
    bestLineSan: ['Kf1'],
    evalAfterCp: -400,
    hangsPiece: false,
    drop: 40,
    fenBefore,
    fenAfter,
    checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore),
    ...overrides
  };
}

describe('ms05OwnCaptureGenerationOmission', () => {
  test('fires when the mover had a profitable capture available and did not play it', () => {
    const ctx = buildPlyDiagnosticContext(
      playQuietMove(OWN_HAS_CHECK_CAPTURE_THREAT_FEN, OWN_HAS_CHECK_CAPTURE_THREAT_AFTER_FEN)
    )!;

    const observation = ms05OwnCaptureGenerationOmission.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('MS-05');
    expect(observation!.direction).toBe('O');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the mover had no profitable capture available', () => {
    const ctx = buildPlyDiagnosticContext(
      playQuietMove(NO_OWN_OPPORTUNITIES_FEN, NO_OWN_OPPORTUNITIES_AFTER_FEN, { moveSan: 'Kd3' })
    )!;

    expect(ms05OwnCaptureGenerationOmission.detect(ctx)).toBeNull();
  });

  test('does not suppress MS-06 firing on the same ply', () => {
    const ctx = buildPlyDiagnosticContext(
      playQuietMove(OWN_HAS_CHECK_CAPTURE_THREAT_FEN, OWN_HAS_CHECK_CAPTURE_THREAT_AFTER_FEN)
    )!;

    expect(ms05OwnCaptureGenerationOmission.detect(ctx)).not.toBeNull();
    expect(ms06OwnThreatGenerationOmission.detect(ctx)).not.toBeNull();
  });
});
