import { describe, expect, test, vi } from 'vitest';
import type { EngineBackend } from './engine-backend.js';
import { EngineSourceLoggingBackend, logEngineSourceUsage } from './engine-source-usage.js';

describe('logEngineSourceUsage', () => {
  test('logs one line naming every non-zero source and the total', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logEngineSourceUsage('user-1', { lichessIndex: 3, internalEngine: 2 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0]!;
    expect(line).toContain('userId=user-1');
    expect(line).toContain('total=5');
    expect(line).toContain('lichessIndex=3');
    expect(line).toContain('internalEngine=2');
    expect(line).toContain('externalEngine=0');

    logSpy.mockRestore();
  });

  test('skips logging when every count is zero', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logEngineSourceUsage('user-1', {});
    logEngineSourceUsage('user-1', { lichessIndex: 0, internalEngine: 0, externalEngine: 0 });

    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});

describe('EngineSourceLoggingBackend', () => {
  function fakeInner(): EngineBackend {
    return { analyzePosition: vi.fn().mockResolvedValue({ fen: 'f' }), analyzeGame: vi.fn().mockResolvedValue([]) };
  }

  test('analyzePosition delegates to inner and logs 1 position for the given source', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const inner = fakeInner();
    const backend = new EngineSourceLoggingBackend(inner, 'user-1', 'internalEngine');

    const result = await backend.analyzePosition('fen-a', { depth: 20 });

    expect(inner.analyzePosition).toHaveBeenCalledWith('fen-a', { depth: 20 });
    expect(result).toEqual({ fen: 'f' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('internalEngine=1'));

    logSpy.mockRestore();
  });

  test('analyzeGame delegates to inner and logs one entry per fen for the given source', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const inner = fakeInner();
    const backend = new EngineSourceLoggingBackend(inner, 'user-1', 'externalEngine');

    await backend.analyzeGame(['a', 'b', 'c']);

    expect(inner.analyzeGame).toHaveBeenCalledWith(['a', 'b', 'c'], undefined);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('externalEngine=3'));

    logSpy.mockRestore();
  });

  test('does not log when the inner call throws', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const inner: EngineBackend = {
      analyzePosition: vi.fn().mockRejectedValue(new Error('boom')),
      analyzeGame: vi.fn()
    };
    const backend = new EngineSourceLoggingBackend(inner, 'user-1', 'internalEngine');

    await expect(backend.analyzePosition('fen-a')).rejects.toThrow('boom');
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
