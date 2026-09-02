import type { ClassifiedMoveDto, PositionFeatures } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms08DestinationSafetyOmission } from './ms-08-destination-safety.js';
import { ms14LoosePieceScanOmission } from './ms-14-loose-piece-scan.js';

const EMPTY_FEATURES: PositionFeatures = {
  turn: 'white',
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

const FEN_BEFORE = 'r3k3/6p1/5Q2/8/8/8/8/R3K3 w - - 0 1';
const FEN_AFTER = 'r3k3/6p1/5Q2/8/8/8/8/R3K3 b - - 1 1';

function playMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Kd2',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: ['Kd2'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER,
    ...overrides
  };
}

const CAPTURES_A1: ClassifiedMoveDto = {
  ply: 2,
  moveSan: 'Rxa1',
  mover: 'black',
  isUserMove: false,
  cpLoss: 0,
  quality: 'best',
  bestLineSan: ['Rxa1'],
  evalAfterCp: -500,
  hangsPiece: false,
  fenBefore: 'r3k3/6p1/5Q2/8/8/8/8/R3K3 b - - 1 1'
};

const HARMLESS_KING_MOVE: ClassifiedMoveDto = {
  ply: 2,
  moveSan: 'Kf8',
  mover: 'black',
  isUserMove: false,
  cpLoss: 0,
  quality: 'best',
  bestLineSan: ['Kf8'],
  evalAfterCp: -500,
  hangsPiece: false,
  fenBefore: 'r3k3/6p1/5Q2/8/8/8/8/R3K3 b - - 1 1'
};

describe('ms14LoosePieceScanOmission', () => {
  test('fires (punished) when a loose own piece is captured within the next two plies', () => {
    const featuresWithLoosePiece: PositionFeatures = {
      ...EMPTY_FEATURES,
      underDefendedPieces: [{ square: 'a1', piece: 'r', color: 'white', attackers: 1, defenders: 0 }]
    };
    const ctx = buildPlyDiagnosticContext(playMove({ features: featuresWithLoosePiece }), {
      nextMoves: [CAPTURES_A1]
    })!;

    const observation = ms14LoosePieceScanOmission.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('MS-14');
    expect(observation!.direction).toBe('N');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the mover has no loose pieces', () => {
    const ctx = buildPlyDiagnosticContext(playMove({ features: EMPTY_FEATURES }), {
      nextMoves: [CAPTURES_A1]
    })!;

    expect(ms14LoosePieceScanOmission.detect(ctx)).toBeNull();
  });

  test('reports not-punished (failed: false) when the loose piece is never captured, without suppressing itself as an opportunity', () => {
    const featuresWithLoosePiece: PositionFeatures = {
      ...EMPTY_FEATURES,
      underDefendedPieces: [{ square: 'a1', piece: 'r', color: 'white', attackers: 1, defenders: 0 }]
    };
    const ctx = buildPlyDiagnosticContext(playMove({ features: featuresWithLoosePiece }), {
      nextMoves: [HARMLESS_KING_MOVE]
    })!;

    const observation = ms14LoosePieceScanOmission.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.failed).toBe(false);
  });

  test('does not suppress MS-08 firing on the same ply', () => {
    const featuresWithLoosePiece: PositionFeatures = {
      ...EMPTY_FEATURES,
      underDefendedPieces: [{ square: 'a1', piece: 'r', color: 'white', attackers: 1, defenders: 0 }]
    };
    const move = playMove({
      moveSan: 'Qf6',
      fenBefore: '4k3/6p1/8/8/8/8/8/4KQ2 w - - 0 1',
      fenAfter: '4k3/6p1/5Q2/8/8/8/8/4K3 b - - 1 1',
      features: featuresWithLoosePiece
    });
    const ctx = buildPlyDiagnosticContext(move, { nextMoves: [CAPTURES_A1] })!;

    expect(ms14LoosePieceScanOmission.detect(ctx)).not.toBeNull();
    expect(ms08DestinationSafetyOmission.detect(ctx)).not.toBeNull();
  });
});
