import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSharedLiteEngineWorker, resetSharedLiteEngineWorkerForTests } from '../engine/shared-engine-worker-instance.js';
import type { EngineWorkerLike } from '../engine/shared-engine-worker.js';
import { useLiteEngineHint } from './useLiteEngineHint.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fakeWorker(): EngineWorkerLike & { sent: string[]; emit: (line: string) => void } {
  const sent: string[] = [];
  const worker: EngineWorkerLike & { sent: string[]; emit: (line: string) => void } = {
    sent,
    onmessage: null,
    postMessage: (message: string) => sent.push(message),
    terminate: vi.fn(),
    emit: (line: string) => worker.onmessage?.({ data: line })
  };
  return worker;
}

/** Seeds the lite singleton with a fake worker before the hook under test
 * ever calls getSharedLiteEngineWorker() itself — same trick
 * useEngineTunnelClient.test.ts's module mock achieves via vi.mock, just
 * done by pre-constructing the singleton instead since this hook calls the
 * real getter directly. */
function seedLiteWorker(): ReturnType<typeof fakeWorker> {
  const worker = fakeWorker();
  getSharedLiteEngineWorker({ createWorker: () => worker });
  return worker;
}

describe('useLiteEngineHint', () => {
  beforeEach(() => resetSharedLiteEngineWorkerForTests());
  afterEach(() => resetSharedLiteEngineWorkerForTests());

  test('reports not-loaded when disabled, and never touches the worker', () => {
    const worker = seedLiteWorker();
    const { result } = renderHook(() => useLiteEngineHint({ enabled: false, fen: START_FEN }));

    expect(result.current.status).toBe('not-loaded');
    expect(worker.sent).toHaveLength(0);
  });

  test('reports not-loaded/loading until the lite worker finishes its handshake, then analyzes', async () => {
    const worker = seedLiteWorker();
    const { result } = renderHook(() => useLiteEngineHint({ enabled: true, fen: START_FEN }));

    expect(result.current.status === 'not-loaded' || result.current.status === 'loading').toBe(true);

    await act(async () => {
      worker.emit('uciok');
      worker.emit('readyok');
      await Promise.resolve();
    });

    expect(worker.sent).toContain('go depth 18');
  });

  test('reports a word-based exploratory evaluation once the lite engine settles', async () => {
    const worker = seedLiteWorker();
    const { result } = renderHook(() => useLiteEngineHint({ enabled: true, fen: START_FEN }));

    await act(async () => {
      worker.emit('uciok');
      worker.emit('readyok');
      await Promise.resolve();
    });

    await act(async () => {
      worker.emit('info depth 18 multipv 1 score cp 250 pv e2e4 e7e5');
      worker.emit('bestmove e2e4 ponder e7e5');
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.evaluation).toBe('White is better'));
    expect(result.current.status).toBe('ready');
  });
});
