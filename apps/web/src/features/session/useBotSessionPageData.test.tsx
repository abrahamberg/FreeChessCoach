import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useBotSessionPageData } from './useBotSessionPageData.js';

const PGN = '[White "daniel"]\n[Black "Bot"]\n\n1. e4 *';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sessionResponse(): Response {
  return jsonResponse({
    id: 'session-1',
    gameId: 'game-1',
    status: 'active',
    mode: 'play_bot',
    subjectPly: 0,
    summary: null,
    homework: null,
    messages: []
  });
}

function gameResponse(liveMoveQualities: unknown[]): Response {
  return jsonResponse({
    id: 'game-1',
    pgn: PGN,
    userColor: 'white',
    whiteName: 'daniel',
    blackName: 'Bot',
    result: null,
    classifiedMoves: null,
    liveMoveQualities,
    gameReport: null,
    botId: 'bot-1',
    clockInitialMs: null,
    clockIncrementMs: null,
    whiteRemainingMs: null,
    blackRemainingMs: null
  });
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useBotSessionPageData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The server already classifies and persists every move's evalAfterCp
  // (commitBotTurn -> classifyAndRecordMove), but the play-move response
  // itself doesn't carry it — the client only ever sees it by refetching the
  // game. Without this, EvalBar/MoveStrip/GameEvalChart (all fed by
  // classifiedMoves) stay frozen at whatever they showed on page load.
  test('a committed move invalidates the game query so classifiedMoves (eval/quality) comes current', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let gameFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/sessions/session-1') return Promise.resolve(sessionResponse());
      if (path === '/api/games/game-1') {
        gameFetchCount += 1;
        return Promise.resolve(
          gameFetchCount === 1
            ? gameResponse([])
            : gameResponse([{ ply: 1, moveSan: 'e4', mover: 'white', quality: 'best', cpLoss: 0, bestLineSan: [], evalAfterCp: 35 }])
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBotSessionPageData('session-1'), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.gameQuery.data).toBeDefined());
    expect(result.current.classifiedMoves).toEqual([]);

    act(() => {
      result.current.handleBotMoveCommitted({ fen: 'fen-after-e4', san: 'e4', ply: 1 }, 'e2e4');
    });

    await waitFor(() => expect(gameFetchCount).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(result.current.classifiedMoves).toEqual([expect.objectContaining({ ply: 1, evalAfterCp: 35 })])
    );
  });
});
