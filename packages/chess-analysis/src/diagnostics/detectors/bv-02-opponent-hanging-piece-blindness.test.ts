import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv02OpponentHangingPieceBlindness } from './bv-02-opponent-hanging-piece-blindness.js';
import { ms05OwnCaptureGenerationOmission } from './ms-05-own-capture-generation.js';

const HANGING_ROOK_FEN = '4k3/8/8/8/8/4K3/8/R6r w - - 0 1';
const HANGING_ROOK_AFTER_FEN = '4k3/8/8/8/8/3K4/8/R6r b - - 1 1';
const NO_HANGING_PIECE_FEN = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
const NO_HANGING_PIECE_AFTER_FEN = '8/8/4k3/8/8/3K4/8/8 b - - 0 1';

function playQuietMove(fenBefore: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Kd3',
    mover: 'white',
    isUserMove: true,
    cpLoss: 350,
    quality: 'blunder',
    bestLineSan: ['Kd3'],
    evalAfterCp: -400,
    hangsPiece: false,
    drop: 40,
    fenBefore,
    fenAfter,
    checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore),
    ...overrides
  };
}

describe('bv02OpponentHangingPieceBlindness', () => {
  test('fires when the mover leaves a zero-defender enemy piece uncaptured', () => {
    const ctx = buildPlyDiagnosticContext(playQuietMove(HANGING_ROOK_FEN, HANGING_ROOK_AFTER_FEN))!;

    const observation = bv02OpponentHangingPieceBlindness.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('BV-02');
    expect(observation!.direction).toBe('O');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when no enemy piece is hanging', () => {
    const ctx = buildPlyDiagnosticContext(playQuietMove(NO_HANGING_PIECE_FEN, NO_HANGING_PIECE_AFTER_FEN))!;

    expect(bv02OpponentHangingPieceBlindness.detect(ctx)).toBeNull();
  });

  test('does not suppress MS-05 firing on the same ply', () => {
    const ctx = buildPlyDiagnosticContext(playQuietMove(HANGING_ROOK_FEN, HANGING_ROOK_AFTER_FEN))!;

    expect(bv02OpponentHangingPieceBlindness.detect(ctx)).not.toBeNull();
    expect(ms05OwnCaptureGenerationOmission.detect(ctx)).not.toBeNull();
  });
});
