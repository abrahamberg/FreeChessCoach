import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv02OpponentHangingPieceBlindness } from './bv-02-opponent-hanging-piece-blindness.js';
import { ms05OwnCaptureGenerationOmission } from './ms-05-own-capture-generation.js';

/** The black rook on h1 has no defender: Rxh1 takes it for free. Evals are
 * White-perspective and hand-set per test. */
const FEN_BEFORE = '4k3/8/8/8/8/4K3/8/R6r w - - 0 1';
const FEN_AFTER: Record<string, string> = {
  Kd3: '4k3/8/8/8/8/3K4/8/R6r b - - 1 1',
  Rxh1: '4k3/8/8/8/8/4K3/8/7R b - - 0 1'
};
const NO_HANGING_PIECE_FEN = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
const NO_HANGING_PIECE_AFTER_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 1 1';

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
    bestLineSan: ['Rxh1'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER[moveSan] ?? FEN_AFTER.Kd3,
    checksCapturesThreats: analyzeChecksCapturesThreats(FEN_BEFORE),
    bestMoveSan: 'Rxh1',
    cpBefore: 800,
    alternatives: [line('Ke2', 0), line('Kd3', -50)],
    ...overrides
  };
}

function contextFor(move: ClassifiedMoveDto) {
  const ctx = buildPlyDiagnosticContext(move);
  if (!ctx) throw new Error('fixture must carry both FENs');
  return ctx;
}

describe('bv02OpponentHangingPieceBlindness', () => {
  test('fails when the free piece was left and the eval confirms the loss', () => {
    const observation = bv02OpponentHangingPieceBlindness.detect(contextFor(play('Kd3', { cpAfter: -50 })));

    expect(observation).toMatchObject({ code: 'BV-02', direction: 'O', failed: true });
  });

  test('succeeds when the free piece was taken', () => {
    const observation = bv02OpponentHangingPieceBlindness.detect(contextFor(play('Rxh1', { cpAfter: 800 })));

    expect(observation).toMatchObject({ code: 'BV-02', failed: false });
  });

  test('no observation when taking the piece is not among the engine lines', () => {
    const observation = bv02OpponentHangingPieceBlindness.detect(
      contextFor(play('Kd3', { bestMoveSan: 'Ke2', cpBefore: 0, cpAfter: -50, alternatives: [line('Kd3', -50)] }))
    );

    expect(observation).toBeNull();
  });

  test('no observation when taking it is no better than the best other line', () => {
    const observation = bv02OpponentHangingPieceBlindness.detect(
      contextFor(play('Kd3', { bestMoveSan: 'Ke2', cpBefore: 820, cpAfter: -50, alternatives: [line('Rxh1', 800)] }))
    );

    expect(observation).toBeNull();
  });

  test('not failed when the played move kept the same value (equal alternative)', () => {
    const observation = bv02OpponentHangingPieceBlindness.detect(contextFor(play('Kd3', { cpAfter: 780 })));

    expect(observation).toMatchObject({ code: 'BV-02', failed: false });
  });

  test('no observation when no enemy piece is hanging', () => {
    const observation = bv02OpponentHangingPieceBlindness.detect(
      contextFor(
        play('Kd3', {
          fenBefore: NO_HANGING_PIECE_FEN,
          fenAfter: NO_HANGING_PIECE_AFTER_FEN,
          checksCapturesThreats: analyzeChecksCapturesThreats(NO_HANGING_PIECE_FEN),
          bestMoveSan: 'Kd3',
          cpBefore: 0,
          cpAfter: 0,
          alternatives: []
        })
      )
    );

    expect(observation).toBeNull();
  });

  test('does not suppress MS-05 firing on the same ply', () => {
    const ctx = contextFor(play('Kd3', { cpAfter: -50 }));

    expect(bv02OpponentHangingPieceBlindness.detect(ctx)?.failed).toBe(true);
    expect(ms05OwnCaptureGenerationOmission.detect(ctx)?.failed).toBe(true);
  });
});
