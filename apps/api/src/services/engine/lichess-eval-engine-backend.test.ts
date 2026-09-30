import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import type { EngineBackend } from './engine-backend.js';
import { LichessEvalEngineBackend } from './lichess-eval-engine-backend.js';
import type { LichessEvalLookupResult, LichessEvalReader } from './lichess-eval-index.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Black's only legal move is Kg8. */
const ONE_MOVE = '7k/8/6K1/8/8/8/8/6R1 b - - 0 1';

const oneLine: LichessEvalLookupResult = { depth: 40, lines: [{ pvUci: ['e2e4'], cp: 20, mate: null }] };

function backendWith(hits: Map<string, LichessEvalLookupResult>) {
  const index: LichessEvalReader = { lookup: (fen) => Promise.resolve(hits.get(fen) ?? null) } as LichessEvalReader;
  const searched: EngineEval = { ply: 0, fen: START, depth: 20, lines: [1, 2, 3].map((n) => ({ moveUci: 'e2e4', moveSan: 'e4', cp: 30 - n, mateIn: null, pvSan: ['e4'] })) };
  const analyzeGame = vi.fn((fens: string[]) => Promise.resolve(fens.map((fen) => ({ ...searched, fen }))));
  const fallback = { analyzeGame } as unknown as EngineBackend;
  return { backend: new LichessEvalEngineBackend(index, fallback), analyzeGame };
}

describe('LichessEvalEngineBackend minLines', () => {
  test('a one-line hit is used as is without minLines', async () => {
    const { backend, analyzeGame } = backendWith(new Map([[START, oneLine]]));
    const [result] = await backend.analyzeGame([START], { multiPv: 3 });
    expect(result?.lines).toHaveLength(1);
    expect(analyzeGame).not.toHaveBeenCalled();
  });

  test('with minLines, a hit with too few lines is searched instead', async () => {
    const { backend, analyzeGame } = backendWith(new Map([[START, oneLine]]));
    const [result] = await backend.analyzeGame([START], { multiPv: 3, minLines: 2 });
    expect(analyzeGame).toHaveBeenCalledWith([START], { multiPv: 3, minLines: 2 });
    expect(result?.lines).toHaveLength(3);
  });

  test('a position with a single legal move keeps its one-line hit', async () => {
    const { backend, analyzeGame } = backendWith(new Map([[ONE_MOVE, { depth: 40, lines: [{ pvUci: ['h8g8'], cp: 0, mate: null }] }]]));
    await backend.analyzeGame([ONE_MOVE], { multiPv: 3, minLines: 2 });
    expect(analyzeGame).not.toHaveBeenCalled();
  });
});
