import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms04OwnCheckGenerationOmission } from './ms-04-own-check-generation.js';

/** White's checks here are Qa4+, Qd7+, Qd8+ and Qe2+; Qxg4 is a non-check
 * capture and Kf1 a quiet king move. Evals are White-perspective and
 * hand-set per test. */
const FEN_BEFORE = '4k3/8/1r6/8/6q1/8/8/3QK3 w - - 0 1';
const FEN_AFTER: Record<string, string> = {
  Kf1: '4k3/8/1r6/8/6q1/8/8/3Q1K2 b - - 1 1',
  'Qe2+': '4k3/8/1r6/8/6q1/8/4Q3/4K3 b - - 1 1',
  Qxg4: '4k3/8/1r6/8/6Q1/8/8/4K3 b - - 0 1'
};
const NO_CHECK_FEN = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
const NO_CHECK_AFTER_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 1 1';

function line(san: string, cp: number) {
  return { san, cp, winPct: 50 };
}

function play(moveSan: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan,
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: ['Qe2+'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER[moveSan] ?? FEN_AFTER.Kf1,
    checksCapturesThreats: analyzeChecksCapturesThreats(FEN_BEFORE),
    bestMoveSan: 'Qe2+',
    cpBefore: 300,
    alternatives: [line('Qd4', 0), line('Kf1', -50)],
    ...overrides
  };
}

function detect(move: ClassifiedMoveDto) {
  const ctx = buildPlyDiagnosticContext(move);
  if (!ctx) throw new Error('fixture must carry both FENs');
  return ms04OwnCheckGenerationOmission.detect(ctx);
}

describe('ms04OwnCheckGenerationOmission', () => {
  test('fails when a real check chance was missed and the eval confirms it', () => {
    const observation = detect(play('Kf1', { cpAfter: -50, quality: 'mistake' }));

    expect(observation).toMatchObject({ code: 'MS-04', direction: 'O', failed: true });
    expect(observation?.detail).toContain('Qe2+');
  });

  test('succeeds when the check was played', () => {
    const observation = detect(play('Qe2+', { cpAfter: 300, quality: 'best' }));

    expect(observation).toMatchObject({ code: 'MS-04', failed: false, hwdl: 0 });
  });

  test('no observation when no check is among the engine lines', () => {
    const observation = detect(
      play('Qxg4', { bestMoveSan: 'Qxg4', cpBefore: 900, cpAfter: 900, alternatives: [line('Qd4', 0)] })
    );

    expect(observation).toBeNull();
  });

  test('no observation when the check is not meaningfully better than the best non-check line', () => {
    const observation = detect(
      play('Kf1', { bestMoveSan: 'Qxg4', cpBefore: 900, cpAfter: -50, alternatives: [line('Qe2+', 300)] })
    );

    expect(observation).toBeNull();
  });

  test('not failed when the played move kept the check\'s value (equal alternative)', () => {
    const observation = detect(play('Kf1', { cpAfter: 290 }));

    expect(observation).toMatchObject({ code: 'MS-04', failed: false });
  });

  test('no observation when the mover had no check at all', () => {
    const observation = detect(
      play('Kd3', {
        fenBefore: NO_CHECK_FEN,
        fenAfter: NO_CHECK_AFTER_FEN,
        checksCapturesThreats: analyzeChecksCapturesThreats(NO_CHECK_FEN),
        bestMoveSan: 'Kd3',
        cpBefore: 0,
        cpAfter: 0,
        alternatives: []
      })
    );

    expect(observation).toBeNull();
  });
});
