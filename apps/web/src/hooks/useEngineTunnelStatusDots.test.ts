import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resetSharedEngineWorkerForTests, resetSharedLiteEngineWorkerForTests } from '../engine/shared-engine-worker-instance.js';
import { getSharedEngineWorker, getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
import type { EngineWorkerLike } from '../engine/shared-engine-worker.js';
import { resetTunnelConnectionStatusForTests, setTunnelConnectionStatus } from '../engine/tunnel-connection-status.js';
import { useEngineTunnelStatusDots } from './useEngineTunnelStatusDots.js';

// A worker that only answers the UCI handshake once told to — lets a test
// hold a worker at "installing" (handshake never completes) before flipping
// it to "ready" on demand.
function controllableWorker(): { worker: EngineWorkerLike; completeHandshake: () => void } {
  let onmessage: ((event: { data: string }) => void) | null = null;
  const worker: EngineWorkerLike = {
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler) {
      onmessage = handler;
    },
    postMessage(message: string) {
      if (message === 'isready') queueMicrotask(() => onmessage?.({ data: 'readyok' }));
    },
    terminate() {}
  };
  return {
    worker,
    completeHandshake: () => onmessage?.({ data: 'uciok' })
  };
}

describe('useEngineTunnelStatusDots', () => {
  beforeEach(() => {
    resetSharedEngineWorkerForTests();
    resetSharedLiteEngineWorkerForTests();
    resetTunnelConnectionStatusForTests();
  });
  afterEach(() => {
    resetSharedEngineWorkerForTests();
    resetSharedLiteEngineWorkerForTests();
    resetTunnelConnectionStatusForTests();
  });

  test('both dots are red when the tunnel socket is not connected, regardless of worker state', () => {
    const { result } = renderHook(() => useEngineTunnelStatusDots());
    expect(result.current).toEqual({ lite: 'red', browser: 'red' });
  });

  test('both dots are yellow once connected but before either worker has finished loading', () => {
    const { result } = renderHook(() => useEngineTunnelStatusDots());

    act(() => setTunnelConnectionStatus('connected'));

    expect(result.current).toEqual({ lite: 'yellow', browser: 'yellow' });
  });

  test('the lite dot turns green once the lite worker is ready, independent of the main worker', async () => {
    const lite = controllableWorker();
    getSharedLiteEngineWorker({ createWorker: () => lite.worker });
    const { result } = renderHook(() => useEngineTunnelStatusDots());

    act(() => setTunnelConnectionStatus('connected'));
    act(() => getSharedLiteEngineWorker().preload());
    await act(async () => lite.completeHandshake());

    expect(result.current).toEqual({ lite: 'green', browser: 'yellow' });
  });

  test('the browser dot turns green once the main worker is ready, independent of the lite worker', async () => {
    const main = controllableWorker();
    getSharedEngineWorker({ createWorker: () => main.worker });
    const { result } = renderHook(() => useEngineTunnelStatusDots());

    act(() => setTunnelConnectionStatus('connected'));
    act(() => getSharedEngineWorker().preload());
    await act(async () => main.completeHandshake());

    expect(result.current).toEqual({ lite: 'yellow', browser: 'green' });
  });
});
