import type { ClassifiedMoveDto, PositionFeatures } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { bv01OwnHangingPieceBlindness } from './bv-01-own-hanging-piece-blindness.js';
import { bv22LoosePieceInventoryFailure } from './bv-22-loose-piece-inventory.js';

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

function playMove(features: PositionFeatures, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
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
    fenBefore: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
    fenAfter: '4k3/8/8/8/8/8/8/R4K2 b - - 1 1',
    features,
    ...overrides
  };
}

describe('bv22LoosePieceInventoryFailure', () => {
  test('fires when at least two of the mover\'s own pieces are simultaneously loose', () => {
    const features: PositionFeatures = {
      ...EMPTY_FEATURES,
      underDefendedPieces: [
        { square: 'b2', piece: 'p', color: 'white', attackers: 1, defenders: 0 },
        { square: 'c2', piece: 'p', color: 'white', attackers: 1, defenders: 0 }
      ]
    };
    const ctx = buildPlyDiagnosticContext(playMove(features))!;

    const observation = bv22LoosePieceInventoryFailure.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('BV-22');
    expect(observation!.direction).toBe('B');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire with fewer than two simultaneous loose pieces', () => {
    const features: PositionFeatures = {
      ...EMPTY_FEATURES,
      underDefendedPieces: [{ square: 'b2', piece: 'p', color: 'white', attackers: 1, defenders: 0 }]
    };
    const ctx = buildPlyDiagnosticContext(playMove(features))!;

    expect(bv22LoosePieceInventoryFailure.detect(ctx)).toBeNull();
  });

  test('does not suppress BV-01 firing on the same ply', () => {
    const features: PositionFeatures = {
      ...EMPTY_FEATURES,
      hangingPieces: [{ square: 'a1', piece: 'r', color: 'white', attackers: 1, defenders: 0 }],
      underDefendedPieces: [
        { square: 'b2', piece: 'p', color: 'white', attackers: 1, defenders: 0 },
        { square: 'c2', piece: 'p', color: 'white', attackers: 1, defenders: 0 }
      ]
    };
    const ctx = buildPlyDiagnosticContext(playMove(features))!;

    expect(bv22LoosePieceInventoryFailure.detect(ctx)).not.toBeNull();
    expect(bv01OwnHangingPieceBlindness.detect(ctx)).not.toBeNull();
  });
});
