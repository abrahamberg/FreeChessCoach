import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import type { EngineBackendAnalyzeOptions } from './engine-backend.js';
import { SearchMemoEngineBackend } from './search-memo-engine-backend.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
/** Black's only legal move is Kg8. */
const ONE_MOVE = '7k/8/6K1/8/8/8/8/6R1 b - - 0 1';

function memoOver(linesFor: (fen: string, opts?: EngineBackendAnalyzeOptions) => number = (_, opts) => opts?.multiPv ?? 5) {
  const analyzeGame = vi.fn((fens: string[], opts?: EngineBackendAnalyzeOptions) =>
    Promise.resolve(
      fens.map((fen, ply): EngineEval => ({
        ply,
        fen,
        depth: opts?.depth ?? 12,
        lines: Array.from({ length: linesFor(fen, opts) }, (_, n) => ({ moveUci: `m${n}`, moveSan: `m${n}`, cp: 50 - n, mateIn: null, pvSan: [] }))
      }))
    )
  );
  return { memo: new SearchMemoEngineBackend({ analyzeGame }), analyzeGame };
}

describe('SearchMemoEngineBackend', () => {
  test('a request an earlier search covers is answered from it, cut to the lines asked for', async () => {
    const { memo, analyzeGame } = memoOver();
    await memo.analyzeGame([START, E4]);
    const [again] = await memo.analyzeGame([E4], { multiPv: 3, minLines: 2 });
    expect(analyzeGame).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ ply: 0, fen: E4 });
    expect(again?.lines.map((line) => line.moveSan)).toEqual(['m0', 'm1', 'm2']);
  });

  test('more lines, another depth, or too few lines for minLines (where more moves are legal) are searched again', async () => {
    const { memo, analyzeGame } = memoOver((fen) => (fen === E4 ? 3 : 1));
    await memo.analyzeGame([START, E4, ONE_MOVE], { multiPv: 3 });
    await memo.analyzeGame([E4], { multiPv: 5 });
    await memo.analyzeGame([E4], { multiPv: 1, depth: 18 });
    await memo.analyzeGame([START, ONE_MOVE], { multiPv: 3, minLines: 2 });
    expect(analyzeGame.mock.calls.map(([fens]) => fens)).toEqual([[START, E4, ONE_MOVE], [E4], [E4], [START]]);
  });
});
