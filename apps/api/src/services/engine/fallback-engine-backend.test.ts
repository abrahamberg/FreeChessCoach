import { describe, expect, test, vi } from 'vitest';
import type { EngineBackend } from './engine-backend.js';
import { FallbackEngineBackend } from './fallback-engine-backend.js';

describe('FallbackEngineBackend', () => {
  test('uses the fallback when the selected method is unavailable', async () => {
    const selected: EngineBackend = {
      analyzePosition: vi.fn().mockRejectedValue(new Error('selected method unavailable')),
      analyzeGame: vi.fn()
    };
    const fallback: EngineBackend = {
      analyzePosition: vi.fn().mockResolvedValue({ fen: 'fen', lines: [] }),
      analyzeGame: vi.fn()
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new FallbackEngineBackend(selected, fallback, 'native');

    await expect(backend.analyzePosition('fen')).resolves.toEqual({ fen: 'fen', lines: [] });
    expect(fallback.analyzePosition).toHaveBeenCalledWith('fen', undefined);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to native'));

    warn.mockRestore();
  });
});
