import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { computeTacticMotifCounts } from './game-tactic-motifs.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';

function evalAt(ply: number, bestMoveUci: string, bestMoveSan: string): EngineEval {
  return { ply, fen: FORK_FEN, depth: 16, lines: [{ moveUci: bestMoveUci, moveSan: bestMoveSan, cp: 500, mateIn: null }] };
}

function baseMove(overrides: Partial<ClassifiedMoveDto> & Pick<ClassifiedMoveDto, 'ply' | 'moveSan' | 'quality'>): ClassifiedMoveDto {
  return {
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FORK_FEN,
    isTacticalPosition: true,
    ...overrides
  };
}

describe('computeTacticMotifCounts', () => {
  test('credits both an opportunity and a find when the player plays the best move', () => {
    const move = baseMove({
      ply: 1,
      moveSan: 'Nd6+',
      quality: 'best',
      moveFlags: {
        isCapture: false,
        isCheck: true,
        isCheckmate: false,
        isPromotion: false,
        isCastle: false,
        movedPieceType: 'n',
        capturedPieceType: null,
        legalMoveCount: 10
      }
    });
    const counts = computeTacticMotifCounts([move], [evalAt(1, 'c4d6', 'Nd6+')]);

    expect(counts.fork).toEqual({ opportunities: 1, found: 1 });
    expect(counts.checkmate).toEqual({ opportunities: 0, found: 0 });
  });

  test('credits only an opportunity when the player misses the best move', () => {
    const move = baseMove({ ply: 1, moveSan: 'Kb1', quality: 'good' });
    const counts = computeTacticMotifCounts([move], [evalAt(1, 'c4d6', 'Nd6+')]);

    expect(counts.fork).toEqual({ opportunities: 1, found: 0 });
  });

  test('skips a move with no stored fenBefore or no best-line move', () => {
    const noFenBefore = baseMove({ ply: 1, moveSan: 'Kb1', quality: 'good', fenBefore: undefined });
    const noBestLine = baseMove({ ply: 2, moveSan: 'Kb1', quality: 'good' });

    const counts = computeTacticMotifCounts(
      [noFenBefore, noBestLine],
      [evalAt(1, 'c4d6', 'Nd6+'), { ply: 2, fen: FORK_FEN, depth: 16, lines: [] }]
    );

    expect(counts.fork).toEqual({ opportunities: 0, found: 0 });
  });
});
