import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import { ENGINE_PING_FEN, type PositionAnalysis } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import type { EngineBackend } from './engine/engine-backend.js';
import type { ResolveEngineBackendCallOptions } from './engine/resolve-engine-backend.js';
import { runEnginePing } from './engine-ping.js';

const profile = vi.hoisted(() => ({ engineMode: 'native' as 'native' | 'browser' | 'chess_api' }));
const resolveEngineBackendMock = vi.hoisted(() => vi.fn());

vi.mock('../db/repositories/users.js', () => ({
  findById: vi.fn(async () => ({ engineMode: profile.engineMode }))
}));

vi.mock('./engine/resolve-engine-backend.js', () => ({
  resolveEngineBackend: resolveEngineBackendMock
}));

type ResolveCall = ResolveEngineBackendCallOptions;

/** Installs a fake pipeline whose backend reports `source` through the
 * per-call observer the way the real Lichess/observing decorators do, then
 * returns the canned analysis. */
function useFakePipeline(source: 'internalEngine' | 'lichessIndex' | null): void {
  resolveEngineBackendMock.mockImplementation(async (_options: unknown, _userId: string, call?: ResolveCall) => {
    const backend: EngineBackend = {
      analyzePosition: async () => {
        if (source !== null) call?.onEngineSource?.(source);
        return cannedAnalysis();
      },
      analyzeGame: async () => []
    };
    return backend;
  });
}

function cannedAnalysis(): PositionAnalysis {
  return {
    fen: ENGINE_PING_FEN,
    depth: 12,
    multiPv: 3,
    bestMove: 'Nf6',
    eval: { cp: -35, mateIn: null },
    lines: [
      { moveUci: 'g8f6', moveSan: 'Nf6', pvSan: ['Nf6'], cp: -35, mateIn: null },
      { moveUci: 'e7e6', moveSan: 'e6', pvSan: ['e6'], cp: -40, mateIn: null },
      { moveUci: 'f8e7', moveSan: 'Be7', pvSan: ['Be7'], cp: -44, mateIn: null }
    ],
    features: computePositionFeatures(ENGINE_PING_FEN)
  };
}

const fakeOptions = {} as Parameters<typeof runEnginePing>[0];

describe('runEnginePing', () => {
  test('shapes the pipeline result into a ping response', async () => {
    useFakePipeline('internalEngine');
    profile.engineMode = 'browser';

    const response = await runEnginePing(fakeOptions, 'user-1', ENGINE_PING_FEN);

    expect(response.engineMode).toBe('browser');
    expect(response.source).toBe('internalEngine');
    expect(response.fen).toBe(ENGINE_PING_FEN);
    expect(response.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(response.depth).toBe(12);
    expect(response.eval).toEqual({ cp: -35, mateIn: null });
    expect(response.lines).toHaveLength(3);
    expect(response.bestMove).toBe('Nf6');
  });

  test('reports a Lichess-bin hit as the source', async () => {
    useFakePipeline('lichessIndex');

    const response = await runEnginePing(fakeOptions, 'user-1', ENGINE_PING_FEN);

    expect(response.source).toBe('lichessIndex');
  });

  test('fails loudly when the pipeline never reports a source', async () => {
    useFakePipeline(null);

    await expect(runEnginePing(fakeOptions, 'user-1', ENGINE_PING_FEN)).rejects.toThrow(/did not report a source/);
  });
});
