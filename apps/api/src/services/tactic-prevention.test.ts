import type { ClassifiedMoveDto, EngineEval, PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import { computeTacticMotifPrevented } from './tactic-prevention.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
// Same placement, black to move — the real board immediately after white's
// ply-1 move (before black replies), i.e. `prior.fenAfter` / `move.fenBefore`.
const FORK_FEN_BLACK_TO_MOVE = '4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1';
const ROOK_MOVED_AWAY_FEN = '4k3/8/8/8/2N5/8/8/K7 w - - 0 1';

// Typed as the richer PositionAnalysisLine (always-present pvSan) so the
// same fixtures work both as EngineEval.lines (EngineLine's pvSan is
// optional — a superset accepts this) and as PositionAnalysis.lines.
const FORK_LINE: PositionAnalysisLine = { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null };
const QUIET_LINE: PositionAnalysisLine = { moveUci: 'a1b1', moveSan: 'Kb1', pvSan: ['Kb1'], cp: 0, mateIn: null };

function move(overrides: Partial<ClassifiedMoveDto> & { ply: number; mover: 'white' | 'black' }): ClassifiedMoveDto {
  return {
    moveSan: 'e4',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

function analysisFixture(fen: string, lines: PositionAnalysis['lines']): PositionAnalysis {
  return {
    fen,
    depth: 12,
    multiPv: lines.length,
    bestMove: lines[0]?.moveSan ?? '',
    eval: { cp: 0, mateIn: null },
    lines,
    features: {} as PositionAnalysis['features']
  };
}

describe('computeTacticMotifPrevented', () => {
  test('Step A hit: reuses the opponent\'s own last-turn eval, zero engine calls', async () => {
    // White (ply 1) leaves a fork lurking (their own analysis, evals[0]).
    // Black (ply 2) plays the move that moves the rook away, defusing it.
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: ROOK_MOVED_AWAY_FEN,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [{ ply: 0, fen: '', depth: 12, lines: [FORK_LINE] }];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.black.fork).toBe(1);
  });

  test('Step A miss + non-tactical position: no engine call, no prevention claimed', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: FORK_FEN_BLACK_TO_MOVE,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [{ ply: 0, fen: '', depth: 12, lines: [QUIET_LINE] }];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.black).toEqual({});
  });

  test('Step A miss + tactical position: exactly one extra engine call, hit recorded', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: ROOK_MOVED_AWAY_FEN,
        isTacticalPosition: true
      })
    ];
    // Opponent's own last-turn eval has nothing (Step A miss).
    const evals: EngineEval[] = [{ ply: 0, fen: '', depth: 12, lines: [QUIET_LINE] }];
    const threatAnalysis = analysisFixture(FORK_FEN, [FORK_LINE]);
    const analyzePosition = vi.fn().mockResolvedValue(threatAnalysis);

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).toHaveBeenCalledTimes(1);
    expect(analyzePosition).toHaveBeenCalledWith(FORK_FEN);
    expect(result.black.fork).toBe(1);
  });

  test('ply-1 move (no prior opponent turn) is skipped cleanly, no throw', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'e4', fenBefore: FORK_FEN_BLACK_TO_MOVE, fenAfter: FORK_FEN_BLACK_TO_MOVE, isTacticalPosition: true })
    ];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, []);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result).toEqual({ white: {}, black: {} });
  });
});
