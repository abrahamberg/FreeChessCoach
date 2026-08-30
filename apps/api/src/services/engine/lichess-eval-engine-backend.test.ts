import { describe, expect, test, vi } from 'vitest';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend } from './engine-backend.js';
import { LichessEvalEngineBackend } from './lichess-eval-engine-backend.js';
import type { LichessEvalLookupResult, LichessEvalReader } from './lichess-eval-index.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SECOND_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function fakeReader(byFen: Record<string, LichessEvalLookupResult>): LichessEvalReader {
  return { lookup: vi.fn(async (fen: string) => byFen[fen] ?? null) };
}

function fakeFallback(): EngineBackend {
  return { analyzePosition: vi.fn(), analyzeGame: vi.fn() };
}

function fakeFallbackResult(fen: string, cp: number): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multiPv: 1,
    bestMove: 'Nf3',
    eval: { cp, mateIn: null },
    lines: [{ moveUci: 'g1f3', moveSan: 'Nf3', pvSan: ['Nf3'], cp, mateIn: null }],
    features: computePositionFeatures(fen)
  };
}

describe('LichessEvalEngineBackend', () => {
  describe('analyzePosition', () => {
    test('returns a single-line hit directly, without calling the fallback', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 40, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const fallback = fakeFallback();
      const backend = new LichessEvalEngineBackend(reader, fallback);

      const result = await backend.analyzePosition(START_FEN);

      expect(result.bestMove).toBe('e4');
      expect(result.multiPv).toBe(1);
      expect(result.eval).toEqual({ cp: 35, mateIn: null });
      expect(result.lines).toEqual([{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 35, mateIn: null }]);
      expect(fallback.analyzePosition).not.toHaveBeenCalled();
    });

    test('returns every stored line, not just the best one', async () => {
      const reader = fakeReader({
        [START_FEN]: {
          depth: 40,
          lines: [
            { cp: 35, mate: null, moveUci: 'e2e4' },
            { cp: 30, mate: null, moveUci: 'd2d4' },
            { cp: 20, mate: null, moveUci: 'g1f3' }
          ]
        }
      });
      const backend = new LichessEvalEngineBackend(reader, fakeFallback());

      const result = await backend.analyzePosition(START_FEN);

      expect(result.multiPv).toBe(3);
      expect(result.bestMove).toBe('e4');
      expect(result.lines).toEqual([
        { moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 35, mateIn: null },
        { moveUci: 'd2d4', moveSan: 'd4', pvSan: ['d4'], cp: 30, mateIn: null },
        { moveUci: 'g1f3', moveSan: 'Nf3', pvSan: ['Nf3'], cp: 20, mateIn: null }
      ]);
    });

    test('maps a mate hit correctly', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 40, lines: [{ cp: null, mate: -3, moveUci: 'e2e4' }] } });
      const backend = new LichessEvalEngineBackend(reader, fakeFallback());

      const result = await backend.analyzePosition(START_FEN);

      expect(result.eval).toEqual({ cp: null, mateIn: -3 });
    });

    test('falls through to the fallback on a miss', async () => {
      const reader = fakeReader({});
      const fallback = fakeFallback();
      const fallbackResult = fakeFallbackResult(START_FEN, 12);
      vi.mocked(fallback.analyzePosition).mockResolvedValue(fallbackResult);
      const backend = new LichessEvalEngineBackend(reader, fallback);

      const result = await backend.analyzePosition(START_FEN);

      expect(result).toEqual(fallbackResult);
      expect(fallback.analyzePosition).toHaveBeenCalledWith(START_FEN, undefined);
    });

    test('treats a hit shallower than minDepth as a miss', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 10, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const fallback = fakeFallback();
      const fallbackResult = fakeFallbackResult(START_FEN, 12);
      vi.mocked(fallback.analyzePosition).mockResolvedValue(fallbackResult);
      const backend = new LichessEvalEngineBackend(reader, fallback, { minDepth: 16 });

      const result = await backend.analyzePosition(START_FEN);

      expect(result).toEqual(fallbackResult);
    });

    test('treats a hit shallower than a caller-requested depth as a miss', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 20, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const fallback = fakeFallback();
      const fallbackResult = fakeFallbackResult(START_FEN, 12);
      vi.mocked(fallback.analyzePosition).mockResolvedValue(fallbackResult);
      const backend = new LichessEvalEngineBackend(reader, fallback);

      const result = await backend.analyzePosition(START_FEN, { depth: 24 });

      expect(result).toEqual(fallbackResult);
      expect(fallback.analyzePosition).toHaveBeenCalledWith(START_FEN, { depth: 24 });
    });

    test('accepts a hit whose depth meets a caller-requested depth', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 24, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const fallback = fakeFallback();
      const backend = new LichessEvalEngineBackend(reader, fallback);

      await backend.analyzePosition(START_FEN, { depth: 24 });

      expect(fallback.analyzePosition).not.toHaveBeenCalled();
    });

    test('reports a hit via onLookup without calling it for a miss', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 40, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const onLookup = vi.fn();
      const backend = new LichessEvalEngineBackend(reader, fakeFallback(), { onLookup });

      await backend.analyzePosition(START_FEN);

      expect(onLookup).toHaveBeenCalledTimes(1);
      expect(onLookup).toHaveBeenCalledWith({ hits: 1, misses: 0 });
    });

    test('reports a miss via onLookup only after the fallback resolves', async () => {
      const reader = fakeReader({});
      const fallback = fakeFallback();
      const fallbackResult = fakeFallbackResult(START_FEN, 12);
      vi.mocked(fallback.analyzePosition).mockResolvedValue(fallbackResult);
      const onLookup = vi.fn();
      const backend = new LichessEvalEngineBackend(reader, fallback, { onLookup });

      await backend.analyzePosition(START_FEN);

      expect(onLookup).toHaveBeenCalledTimes(1);
      expect(onLookup).toHaveBeenCalledWith({ hits: 0, misses: 1 });
    });

    test('does not call onLookup when the fallback throws', async () => {
      const reader = fakeReader({});
      const fallback = fakeFallback();
      vi.mocked(fallback.analyzePosition).mockRejectedValue(new Error('engine unavailable'));
      const onLookup = vi.fn();
      const backend = new LichessEvalEngineBackend(reader, fallback, { onLookup });

      await expect(backend.analyzePosition(START_FEN)).rejects.toThrow('engine unavailable');

      expect(onLookup).not.toHaveBeenCalled();
    });
  });

  describe('analyzeGame', () => {
    test('serves hits from the index and only sends misses to the fallback, preserving ply order', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 40, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const fallback = fakeFallback();
      const fallbackEval: EngineEval = {
        ply: 0,
        fen: SECOND_FEN,
        depth: 16,
        lines: [{ moveUci: 'e7e5', moveSan: 'e5', cp: -10, mateIn: null }]
      };
      vi.mocked(fallback.analyzeGame).mockResolvedValue([fallbackEval]);
      const backend = new LichessEvalEngineBackend(reader, fallback);

      const result = await backend.analyzeGame([START_FEN, SECOND_FEN]);

      expect(fallback.analyzeGame).toHaveBeenCalledWith([SECOND_FEN], undefined);
      expect(result).toEqual([
        { ply: 0, fen: START_FEN, depth: 40, lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 35, mateIn: null }] },
        { ply: 1, fen: SECOND_FEN, depth: 16, lines: [{ moveUci: 'e7e5', moveSan: 'e5', cp: -10, mateIn: null }] }
      ]);
    });

    test('never calls the fallback when every position is a hit', async () => {
      const reader = fakeReader({
        [START_FEN]: { depth: 40, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] },
        [SECOND_FEN]: { depth: 38, lines: [{ cp: -20, mate: null, moveUci: 'c7c5' }] }
      });
      const fallback = fakeFallback();
      const backend = new LichessEvalEngineBackend(reader, fallback);

      await backend.analyzeGame([START_FEN, SECOND_FEN]);

      expect(fallback.analyzeGame).not.toHaveBeenCalled();
    });

    test('sends every position to the fallback when none are hits', async () => {
      const reader = fakeReader({});
      const fallback = fakeFallback();
      vi.mocked(fallback.analyzeGame).mockResolvedValue([
        { ply: 0, fen: START_FEN, depth: 16, lines: [] },
        { ply: 1, fen: SECOND_FEN, depth: 16, lines: [] }
      ]);
      const backend = new LichessEvalEngineBackend(reader, fallback);

      await backend.analyzeGame([START_FEN, SECOND_FEN]);

      expect(fallback.analyzeGame).toHaveBeenCalledWith([START_FEN, SECOND_FEN], undefined);
    });

    test('reports the hit/miss split for a mixed batch via onLookup, once fallback resolves', async () => {
      const reader = fakeReader({ [START_FEN]: { depth: 40, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] } });
      const fallback = fakeFallback();
      vi.mocked(fallback.analyzeGame).mockResolvedValue([{ ply: 0, fen: SECOND_FEN, depth: 16, lines: [] }]);
      const onLookup = vi.fn();
      const backend = new LichessEvalEngineBackend(reader, fallback, { onLookup });

      await backend.analyzeGame([START_FEN, SECOND_FEN]);

      expect(onLookup).toHaveBeenCalledTimes(1);
      expect(onLookup).toHaveBeenCalledWith({ hits: 1, misses: 1 });
    });
  });
});
