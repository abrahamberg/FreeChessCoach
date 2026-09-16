import type { ClassifiedMoveDto, FeatureDeltaDto, PositionFeatures } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv01OwnHangingPieceBlindness } from './bv-01-own-hanging-piece-blindness.js';
import { bv10LastMoveBoardUpdateFailure } from './bv-10-last-move-board-update.js';

const EMPTY_FEATURES: PositionFeatures = {
  turn: 'black',
  boardState: 'none',
  availableMoves: [],
  mobility: { white: 0, black: 0 },
  controlledSquares: [],
  piecesUnderAttack: [],
  hangingPieces: [],
  underDefendedPieces: [],
  overloadedDefenders: [],
  centerControlScore: { white: 0, black: 0 },
  openFiles: [],
  semiOpenFiles: [],
  doubledPawns: [],
  isolatedPawns: [],
  passedPawns: [],
  targetsAttacked: [],
  forks: [],
  captureOpportunities: []
};

const EMPTY_DELTA: FeatureDeltaDto = { newForks: [], newHangingPieces: [], mobilityDelta: 0 };

function previousMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Qh5',
    mover: 'black',
    isUserMove: false,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['Qh5'],
    evalAfterCp: -300,
    hangsPiece: false,
    featureDelta: EMPTY_DELTA,
    ...overrides
  };
}

function currentMove(features: PositionFeatures, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 2,
    moveSan: 'Kf1',
    mover: 'white',
    isUserMove: true,
    cpLoss: 350,
    quality: 'blunder',
    bestLineSan: ['Kf1'],
    evalAfterCp: -400,
    hangsPiece: false,
    drop: 40,
    fenBefore: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
    fenAfter: '4k3/8/8/8/8/8/8/R4K2 b - - 1 1',
    features,
    ...overrides
  };
}

describe('bv10LastMoveBoardUpdateFailure', () => {
  test('fires when the opponent\'s last move newly hung a mover piece that is still hanging after this move', () => {
    const hungPiece = { square: 'a1', piece: 'r' as const, color: 'white' as const, attackers: 1, defenders: 0 };
    const ctx = buildPlyDiagnosticContext(currentMove({ ...EMPTY_FEATURES, hangingPieces: [hungPiece] }), {
      previousMove: previousMove({ featureDelta: { ...EMPTY_DELTA, newHangingPieces: [hungPiece] } })
    })!;

    const observation = bv10LastMoveBoardUpdateFailure.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('BV-10');
    expect(observation!.direction).toBe('B');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the newly-hung piece was addressed (no longer hanging after this move)', () => {
    const hungPiece = { square: 'a1', piece: 'r' as const, color: 'white' as const, attackers: 1, defenders: 0 };
    const ctx = buildPlyDiagnosticContext(currentMove(EMPTY_FEATURES), {
      previousMove: previousMove({ featureDelta: { ...EMPTY_DELTA, newHangingPieces: [hungPiece] } })
    })!;

    expect(bv10LastMoveBoardUpdateFailure.detect(ctx)).toBeNull();
  });

  test('does not fire without a previousMove (unknown history)', () => {
    const hungPiece = { square: 'a1', piece: 'r' as const, color: 'white' as const, attackers: 1, defenders: 0 };
    const ctx = buildPlyDiagnosticContext(currentMove({ ...EMPTY_FEATURES, hangingPieces: [hungPiece] }))!;

    expect(bv10LastMoveBoardUpdateFailure.detect(ctx)).toBeNull();
  });

  test('does not suppress BV-01 firing on the same ply', () => {
    const hungPiece = { square: 'a1', piece: 'r' as const, color: 'white' as const, attackers: 1, defenders: 0 };
    const ctx = buildPlyDiagnosticContext(currentMove({ ...EMPTY_FEATURES, hangingPieces: [hungPiece] }), {
      previousMove: previousMove({ featureDelta: { ...EMPTY_DELTA, newHangingPieces: [hungPiece] } })
    })!;

    expect(bv10LastMoveBoardUpdateFailure.detect(ctx)).not.toBeNull();
    expect(bv01OwnHangingPieceBlindness.detect(ctx)).not.toBeNull();
  });
});
