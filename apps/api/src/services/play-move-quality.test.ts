import { describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { classifyPlayMove } from './play-move-quality.js';

const FEN_BEFORE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN_AFTER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function analysisFixture(fen: string, bestMove: string, cp: number): PositionAnalysis {
  return {
    fen,
    depth: 18,
    multiPv: 1,
    bestMove,
    eval: { cp, mateIn: null },
    lines: [{ moveUci: 'e2e4', moveSan: bestMove, pvSan: [bestMove], cp, mateIn: null }],
    features: {
      turn: 'white',
      boardState: 'none',
      availableMoves: [],
      mobility: { white: 20, black: 20 },
      controlledSquares: [],
      piecesUnderAttack: [],
      hangingPieces: [],
      underDefendedPieces: [],
      overloadedDefenders: [],
      centerControlScore: { white: 2, black: 2 },
      openFiles: [],
      semiOpenFiles: [],
      doubledPawns: [],
      isolatedPawns: [],
      passedPawns: [],
      targetsAttacked: [],
      forks: [],
      captureOpportunities: []
    }
  };
}

describe('classifyPlayMove', () => {
  test('the engine top choice played gets quality "best" and cpLoss 0', async () => {
    const analyzePosition = vi
      .fn()
      .mockResolvedValueOnce(analysisFixture(FEN_BEFORE, 'e4', 20))
      .mockResolvedValueOnce(analysisFixture(FEN_AFTER, 'e4', 20));

    const classified = await classifyPlayMove(analyzePosition, {
      ply: 1,
      moveSan: 'e4',
      mover: 'white',
      fenBefore: FEN_BEFORE,
      fenAfter: FEN_AFTER,
      userColor: 'white'
    });

    expect(classified.moveSan).toBe('e4');
    expect(classified.quality).toBe('best');
    expect(classified.cpLoss).toBe(0);
    expect(classified.diagnosisCodes).toEqual([]);
  });

  test('computeDiagnosisCodes runs the real diagnostics registry and reports what it finds (Phase 62 Task 62.4)', async () => {
    // Qd5 walks the white queen into an undefended square attacked by the
    // black rook on d8 — a genuine self-blunder (BV-01: own hanging-piece
    // blindness), independent of the mocked eval numbers below (which only
    // drive quality/cpLoss classification, not the positional detector).
    const fenBefore = '3rk3/8/8/8/8/8/8/3Q3K w - - 0 1';
    const fenAfter = '3rk3/8/8/3Q4/8/8/8/7K b - - 1 1';
    const analyzePosition = vi
      .fn()
      .mockResolvedValueOnce(analysisFixture(fenBefore, 'Kh2', 50))
      .mockResolvedValueOnce(analysisFixture(fenAfter, 'Rxd5', -900));

    const classified = await classifyPlayMove(analyzePosition, {
      ply: 1,
      moveSan: 'Qd5',
      mover: 'white',
      fenBefore,
      fenAfter,
      userColor: 'white',
      computeDiagnosisCodes: true
    });

    expect(classified.quality).not.toBe('best');
    expect(classified.diagnosisCodes).toContain('BV-01');
  });

  test('computeDiagnosisCodes defaults to false and reports an empty array even for a genuine blunder', async () => {
    const fenBefore = '3rk3/8/8/8/8/8/8/3Q3K w - - 0 1';
    const fenAfter = '3rk3/8/8/3Q4/8/8/8/7K b - - 1 1';
    const analyzePosition = vi
      .fn()
      .mockResolvedValueOnce(analysisFixture(fenBefore, 'Kh2', 50))
      .mockResolvedValueOnce(analysisFixture(fenAfter, 'Rxd5', -900));

    const classified = await classifyPlayMove(analyzePosition, {
      ply: 1,
      moveSan: 'Qd5',
      mover: 'white',
      fenBefore,
      fenAfter,
      userColor: 'white'
    });

    expect(classified.diagnosisCodes).toEqual([]);
  });
});
