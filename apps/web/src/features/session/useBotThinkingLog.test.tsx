import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useBotThinkingLog } from './useBotThinkingLog.js';

const DONE_MOVE = {
  ply: 2,
  source: 'turn',
  status: 'done',
  startedAt: 1000,
  endedAt: 2400,
  path: 'top moves — best move',
  picked: 'e5',
  engineMode: 'internal',
  steps: []
};
const THINKING_MOVE = { ...DONE_MOVE, status: 'thinking', endedAt: null, path: null, picked: null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useBotThinkingLog', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('loads the log for the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ moves: [DONE_MOVE] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBotThinkingLog('s1', { isBotTurn: false }), { wrapper });

    await waitFor(() => expect(result.current.moves).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/s1/bot-thinking', expect.objectContaining({ credentials: 'include' }));
  });

  test('keeps polling while it is the bot\'s turn', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ moves: [] })));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useBotThinkingLog('s1', { isBotTurn: true, pollMs: 15 }), { wrapper });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  test('does not poll when it is not the bot\'s turn and nothing is still thinking', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ moves: [DONE_MOVE] })));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBotThinkingLog('s1', { isBotTurn: false, pollMs: 15 }), { wrapper });
    await waitFor(() => expect(result.current.moves).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('keeps polling after the turn passes while the latest move still shows as thinking, then stops once it is done', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ moves: [THINKING_MOVE] })))
      .mockImplementation(() => Promise.resolve(jsonResponse({ moves: [DONE_MOVE] })));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBotThinkingLog('s1', { isBotTurn: false, pollMs: 15 }), { wrapper });

    await waitFor(() => expect(result.current.moves[0]?.status).toBe('done'));
    const callsWhenDone = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callsWhenDone).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBe(callsWhenDone);
  });

  test('a failing request leaves an empty log rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ title: 'nope' }, 404)));

    const { result } = renderHook(() => useBotThinkingLog('s1', { isBotTurn: false }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.moves).toEqual([]);
  });
});
