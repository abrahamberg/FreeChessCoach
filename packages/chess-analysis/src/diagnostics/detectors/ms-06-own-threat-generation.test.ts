import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms06OwnThreatGenerationOmission } from './ms-06-own-threat-generation.js';

/** White's quiet threats here are Qb3, Qd4, Qd6 and Qb1 (each newly attacks
 * the b6 rook); Qxg4 is a capture, Qe2+ a check and Kf1 a quiet king move.
 * Evals are White-perspective and hand-set per test. */
const FEN_BEFORE = '4k3/8/1r6/8/6q1/8/8/3QK3 w - - 0 1';
const FEN_AFTER: Record<string, string> = {
  Kf1: '4k3/8/1r6/8/6q1/8/8/3Q1K2 b - - 1 1',
  Qd4: '4k3/8/1r6/8/3Q2q1/8/8/4K3 b - - 1 1',
  Qxg4: '4k3/8/1r6/8/6Q1/8/8/4K3 b - - 0 1'
};
const NO_THREAT_FEN = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
const NO_THREAT_AFTER_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 1 1';

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
    bestLineSan: ['Qd4'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER[moveSan] ?? FEN_AFTER.Kf1,
    checksCapturesThreats: analyzeChecksCapturesThreats(FEN_BEFORE),
    bestMoveSan: 'Qd4',
    cpBefore: 300,
    alternatives: [line('Qe2+', 0), line('Kf1', -50)],
    ...overrides
  };
}

function detect(move: ClassifiedMoveDto) {
  const ctx = buildPlyDiagnosticContext(move);
  if (!ctx) throw new Error('fixture must carry both FENs');
  return ms06OwnThreatGenerationOmission.detect(ctx);
}

describe('ms06OwnThreatGenerationOmission', () => {
  test('fails when a real threat chance was missed and the eval confirms it', () => {
    const observation = detect(play('Kf1', { cpAfter: -50, quality: 'mistake' }));

    expect(observation).toMatchObject({ code: 'MS-06', direction: 'O', failed: true });
    expect(observation?.detail).toContain('Qd4');
  });

  test('succeeds when the threat was played', () => {
    const observation = detect(play('Qd4', { cpAfter: 300, quality: 'best' }));

    expect(observation).toMatchObject({ code: 'MS-06', failed: false, hwdl: 0 });
  });

  test('no observation when no threat is among the engine lines', () => {
    const observation = detect(
      play('Qxg4', { bestMoveSan: 'Qxg4', cpBefore: 900, cpAfter: 900, alternatives: [line('Qe2+', 0)] })
    );

    expect(observation).toBeNull();
  });

  test('no observation when the threat is not meaningfully better than the best non-threat line', () => {
    const observation = detect(
      play('Kf1', { bestMoveSan: 'Qxg4', cpBefore: 900, cpAfter: -50, alternatives: [line('Qd4', 300)] })
    );

    expect(observation).toBeNull();
  });

  test('not failed when the played move kept the threat\'s value (equal alternative)', () => {
    const observation = detect(play('Kf1', { cpAfter: 290 }));

    expect(observation).toMatchObject({ code: 'MS-06', failed: false });
  });

  test('no observation when the mover had no threat at all', () => {
    const observation = detect(
      play('Kd3', {
        fenBefore: NO_THREAT_FEN,
        fenAfter: NO_THREAT_AFTER_FEN,
        checksCapturesThreats: analyzeChecksCapturesThreats(NO_THREAT_FEN),
        bestMoveSan: 'Kd3',
        cpBefore: 0,
        cpAfter: 0,
        alternatives: []
      })
    );

    expect(observation).toBeNull();
  });
});
