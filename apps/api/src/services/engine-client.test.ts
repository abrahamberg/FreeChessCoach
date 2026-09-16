import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeGameViaEngine, ENGINE_MULTI_PV } from './engine-client.js';

describe('analyzeGameViaEngine', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const engineUrl = 'http://localhost:3001';
  const fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'];

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ evals: [] })
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends ENGINE_MULTI_PV by default', async () => {
    await analyzeGameViaEngine(engineUrl, fens);

    expect(mockFetch).toHaveBeenCalledWith(`${engineUrl}/analyze-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fens, priority: undefined, multiPv: ENGINE_MULTI_PV, depth: undefined })
    });
  });

  it('forwards an explicit multiPv and depth', async () => {
    await analyzeGameViaEngine(engineUrl, fens, 3, 12);

    expect(mockFetch).toHaveBeenCalledWith(`${engineUrl}/analyze-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fens, priority: undefined, multiPv: 3, depth: 12 })
    });
  });
});
