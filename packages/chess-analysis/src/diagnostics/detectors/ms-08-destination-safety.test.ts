import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { ms08DestinationSafetyOmission } from './ms-08-destination-safety.js';
import { ms14LoosePieceScanOmission } from './ms-14-loose-piece-scan.js';

const FEN_BEFORE = '4k3/6p1/8/8/8/8/8/4KQ2 w - - 0 1';

function playMove(moveSan: string, fenAfter: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan,
    mover: 'white',
    isUserMove: true,
    cpLoss: 900,
    quality: 'blunder',
    bestLineSan: [moveSan],
    evalAfterCp: -900,
    hangsPiece: true,
    drop: 90,
    fenBefore: FEN_BEFORE,
    fenAfter,
    ...overrides
  };
}

describe('ms08DestinationSafetyOmission', () => {
  test('fires when the move lands on a square the opponent can profitably capture', () => {
    const ctx = buildPlyDiagnosticContext(playMove('Qf6', '4k3/6p1/5Q2/8/8/8/8/4K3 b - - 1 1'))!;

    const observation = ms08DestinationSafetyOmission.detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('MS-08');
    expect(observation!.direction).toBe('N');
    expect(observation!.failed).toBe(true);
  });

  test('does not fire when the destination square is safe', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove('Qf4', '4k3/6p1/8/8/5Q2/8/8/4K3 b - - 1 1', { quality: 'best', cpLoss: 0, drop: 0, hangsPiece: false })
    )!;

    expect(ms08DestinationSafetyOmission.detect(ctx)).toBeNull();
  });

  test('does not suppress MS-14 firing on the same ply when a separate loose piece is also punished', () => {
    const move = playMove('Qf6', '4k3/6p1/5Q2/8/8/8/8/4K3 b - - 1 1');
    const ctx = buildPlyDiagnosticContext(move, {
      nextMoves: [
        {
          ply: 2,
          moveSan: 'Rxa1',
          mover: 'black',
          isUserMove: false,
          cpLoss: 0,
          quality: 'best',
          bestLineSan: ['Rxa1'],
          evalAfterCp: -900,
          hangsPiece: false,
          fenBefore: 'r3k3/6p1/5Q2/8/8/8/8/R3K3 b - - 1 1'
        }
      ]
    })!;
    ctx.features = {
      turn: 'white',
      boardState: 'none',
      availableMoves: [],
      mobility: { white: 0, black: 0 },
      controlledSquares: [],
      piecesUnderAttack: [],
      hangingPieces: [],
      underDefendedPieces: [{ square: 'a1', piece: 'r', color: 'white', attackers: 1, defenders: 0 }],
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

    expect(ms08DestinationSafetyOmission.detect(ctx)).not.toBeNull();
    expect(ms14LoosePieceScanOmission.detect(ctx)).not.toBeNull();
  });
});
