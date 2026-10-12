import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms05OwnCaptureGenerationOmission } from './ms-05-own-capture-generation.js';

/** White can take the undefended queen on g4 (Qxg4, SEE 900); Qd4 is a
 * quiet threat on the b6 rook; Kf1 is a quiet king move. Evals are
 * White-perspective and hand-set per test. */
const FEN_BEFORE = '4k3/8/1r6/8/6q1/8/8/3QK3 w - - 0 1';
const FEN_AFTER: Record<string, string> = {
  Kf1: '4k3/8/1r6/8/6q1/8/8/3Q1K2 b - - 1 1',
  Qxg4: '4k3/8/1r6/8/6Q1/8/8/4K3 b - - 0 1',
  Qd4: '4k3/8/1r6/8/3Q2q1/8/8/4K3 b - - 1 1'
};
const NO_CAPTURE_FEN = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
const NO_CAPTURE_AFTER_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 1 1';

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
    bestLineSan: ['Qxg4'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER[moveSan] ?? FEN_AFTER.Kf1,
    checksCapturesThreats: analyzeChecksCapturesThreats(FEN_BEFORE),
    bestMoveSan: 'Qxg4',
    cpBefore: 900,
    alternatives: [line('Qd4', 0), line('Kf1', -50)],
    ...overrides
  };
}

function detect(move: ClassifiedMoveDto) {
  const ctx = buildPlyDiagnosticContext(move);
  if (!ctx) throw new Error('fixture must carry both FENs');
  return ms05OwnCaptureGenerationOmission.detect(ctx);
}

describe('ms05OwnCaptureGenerationOmission', () => {
  test('fails when a real capture chance was missed and the eval confirms it', () => {
    const observation = detect(play('Kf1', { cpAfter: -50, quality: 'blunder' }));

    expect(observation).toMatchObject({ code: 'MS-05', direction: 'O', failed: true });
    expect(observation?.hwdl).toBeGreaterThan(0);
  });

  test('succeeds when the capture was taken', () => {
    const observation = detect(play('Qxg4', { cpAfter: 900, quality: 'best' }));

    expect(observation).toMatchObject({ code: 'MS-05', failed: false, hwdl: 0 });
  });

  test('no observation when the capture is not among the engine lines (poisoned)', () => {
    const observation = detect(
      play('Qd4', { bestMoveSan: 'Qd4', cpBefore: 50, cpAfter: 50, alternatives: [line('Kf1', 0)] })
    );

    expect(observation).toBeNull();
  });

  test('no observation when the capture is not meaningfully better than the best non-capture line', () => {
    const observation = detect(play('Qd4', { cpAfter: 880, alternatives: [line('Qd4', 880)] }));

    expect(observation).toBeNull();
  });

  test('not failed when the played move kept the chance\'s value (equal alternative)', () => {
    const observation = detect(play('Kf1', { cpAfter: 880, alternatives: [line('Qd4', 0)] }));

    expect(observation).toMatchObject({ code: 'MS-05', failed: false });
  });

  test('no observation when there is no capture at all', () => {
    const observation = detect(
      play('Kd3', {
        fenBefore: NO_CAPTURE_FEN,
        fenAfter: NO_CAPTURE_AFTER_FEN,
        checksCapturesThreats: analyzeChecksCapturesThreats(NO_CAPTURE_FEN),
        bestMoveSan: 'Kd3',
        cpBefore: 0,
        cpAfter: 0,
        alternatives: []
      })
    );

    expect(observation).toBeNull();
  });

  test('a capture below the SEE threshold is not a chance', () => {
    // The g4 queen swapped for a pawn defended from h5: Qxg4 loses the queen.
    const fenBefore = '4k3/8/1r6/7p/6p1/8/8/3QK3 w - - 0 1';
    const observation = detect(
      play('Kf1', {
        fenBefore,
        fenAfter: '4k3/8/1r6/7p/6p1/8/8/3Q1K2 b - - 1 1',
        checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore),
        cpAfter: -50
      })
    );

    expect(observation).toBeNull();
  });
});
