import type { PositionAnalysis } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import { scanPositionTactics } from './position-tactics.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const MOVER_IN_CHECK_FEN = 'rnb1k1nr/pppp1ppp/8/2b5/4P3/8/PPPP1qPP/RNBQKBNR w KQkq - 0 3';

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

describe('scanPositionTactics', () => {
  test('available comes from the caller-supplied analysis; allowed costs exactly one extra engine call', async () => {
    const primaryAnalysis = analysisFixture(FORK_FEN, [
      { moveUci: 'a1b2', moveSan: 'Kb2', pvSan: ['Kb2'], cp: 400, mateIn: null },
      { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null }
    ]);
    const threatAnalysis = analysisFixture('4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1', [
      { moveUci: 'e8d8', moveSan: 'Kd8', pvSan: ['Kd8'], cp: -400, mateIn: null }
    ]);
    const analyzePosition = vi.fn().mockResolvedValue(threatAnalysis);

    const result = await scanPositionTactics({ analyzePosition }, FORK_FEN, primaryAnalysis);

    expect(analyzePosition).toHaveBeenCalledTimes(1);
    expect(analyzePosition).toHaveBeenCalledWith('4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1');
    expect(result.available).toEqual([{ moveSan: 'Nd6+', motif: 'fork', rank: 1 }]);
    expect(result.allowed).not.toBeNull();
  });

  test('returns allowed: null with zero extra engine calls when the side to move is in check', async () => {
    const primaryAnalysis = analysisFixture(MOVER_IN_CHECK_FEN, []);
    const analyzePosition = vi.fn();

    const result = await scanPositionTactics({ analyzePosition }, MOVER_IN_CHECK_FEN, primaryAnalysis);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.allowed).toBeNull();
  });
});
