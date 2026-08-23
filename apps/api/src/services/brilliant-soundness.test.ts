import { describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { winPctFor } from '@freechesscoach/chess-analysis';
import { checkBrilliantSoundness } from './brilliant-soundness.js';

const FEN_AFTER_MOVE = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

function analysisWithReply(cp: number): PositionAnalysis {
  return {
    fen: FEN_AFTER_MOVE,
    depth: 16,
    multiPv: 1,
    bestMove: 'Nf3',
    eval: { cp, mateIn: null },
    lines: [{ moveUci: 'g1f3', moveSan: 'Nf3', pvSan: ['Nf3'], cp, mateIn: null }],
    features: {} as PositionAnalysis['features']
  };
}

describe('checkBrilliantSoundness', () => {
  test('accepts a candidate when the opponent best reply preserves the threshold', async () => {
    const beforeWin = 70;
    const analyzePosition = vi.fn().mockResolvedValue(analysisWithReply(200));

    const result = await checkBrilliantSoundness(
      { analyzePosition },
      FEN_AFTER_MOVE,
      'white',
      beforeWin
    );

    expect(result).toBe(winPctFor('white', 200) >= beforeWin - 3);
    expect(analyzePosition).toHaveBeenCalledTimes(1);
    expect(analyzePosition).toHaveBeenCalledWith(FEN_AFTER_MOVE);
  });

  test('rejects a candidate when the opponent best reply drops below the threshold', async () => {
    const analyzePosition = vi.fn().mockResolvedValue(analysisWithReply(-200));

    await expect(
      checkBrilliantSoundness({ analyzePosition }, FEN_AFTER_MOVE, 'white', 70)
    ).resolves.toBe(false);
  });

  test('rejects a position with no legal opponent reply', async () => {
    const analyzePosition = vi.fn().mockResolvedValue({ lines: [] });

    await expect(
      checkBrilliantSoundness({ analyzePosition }, FEN_AFTER_MOVE, 'white', 70)
    ).resolves.toBe(false);
  });
});
