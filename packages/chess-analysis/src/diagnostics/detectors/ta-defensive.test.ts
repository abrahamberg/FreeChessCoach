import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { TA_DEFENSIVE_DETECTORS } from './ta-defensive.js';

function detectorFor(code: string) {
  const detector = TA_DEFENSIVE_DETECTORS.find((d) => d.code === code);
  if (!detector) throw new Error(`no defensive detector registered for ${code}`);
  return detector;
}

function playMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Kb1',
    mover: 'white',
    isUserMove: true,
    cpLoss: 400,
    quality: 'blunder',
    bestLineSan: ['Kb1'],
    evalAfterCp: -400,
    hangsPiece: false,
    drop: 45,
    fenBefore: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    fenAfter: '4k3/8/8/8/8/8/1K6/8 b - - 1 1',
    ...overrides
  };
}

describe('TA_DEFENSIVE_DETECTORS', () => {
  test('has exactly one detector per defensive code, all direction D, excludes the fork/pin sub-codes', () => {
    const codes = TA_DEFENSIVE_DETECTORS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(TA_DEFENSIVE_DETECTORS.every((d) => d.direction === 'D')).toBe(true);
    for (const subCode of ['TA-07', 'TA-08', 'TA-09', 'TA-10', 'TA-11', 'TA-12']) {
      expect(codes).not.toContain(subCode);
    }
  });

  test('fires from tacticDiagnostic (Task 50.4\'s unbiased diagnosticByPly), not tacticPrevention', () => {
    const ctx = buildPlyDiagnosticContext(playMove(), {
      tacticDiagnostic: { type: 'skewer', failed: true, detail: 'missed the skewer on the rook' }
    })!;

    const observation = detectorFor('TA-14').detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('TA-14');
    expect(observation!.direction).toBe('D');
    expect(observation!.failed).toBe(true);
  });

  test('records failed: false when the mover defused the reachable motif', () => {
    const ctx = buildPlyDiagnosticContext(playMove(), {
      tacticDiagnostic: { type: 'skewer', failed: false, detail: 'defused the skewer' }
    })!;

    expect(detectorFor('TA-14').detect(ctx)!.failed).toBe(false);
  });

  test('does not fire without a tacticDiagnostic entry for this ply', () => {
    const ctx = buildPlyDiagnosticContext(playMove())!;

    expect(detectorFor('TA-14').detect(ctx)).toBeNull();
  });

  test('a fork/pin tacticDiagnostic entry fires no defensive detector at all (no sub-typing without a replay)', () => {
    const ctx = buildPlyDiagnosticContext(playMove(), {
      tacticDiagnostic: { type: 'fork', failed: true, detail: 'missed a fork' }
    })!;

    expect(TA_DEFENSIVE_DETECTORS.every((detector) => detector.detect(ctx) === null)).toBe(true);
  });
});
