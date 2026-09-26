import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useSessionPageData } from './useSessionPageData.js';

const GAME = {
  id: 'g1',
  pgn: '1. e4 e5 2. Nf3 Nc6 *',
  userColor: 'white',
  whiteName: null,
  blackName: null,
  result: null,
  classifiedMoves: null
};

function session(subjectPly: number, replies: string[]) {
  return {
    id: 's1',
    gameId: 'g1',
    status: 'active',
    mode: 'analyze',
    subjectPly,
    summary: null,
    homework: null,
    messages: replies.map((text, index) => ({ id: `m${index}`, role: 'assistant', content: text }))
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('useSessionPageData', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('coming back to a session seeds the board and transcript from the fresh fetch, not the cached earlier visit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // What the first visit left in the cache: the board on the start position.
    client.setQueryData(['session', 's1'], session(0, ['Welcome.']));
    client.setQueryData(['game', 'g1'], GAME);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/sessions/s1') return Promise.resolve(jsonResponse(session(3, ['Welcome.', 'Look at 2.Nf3.'])));
        if (url === '/api/games/g1') return Promise.resolve(jsonResponse(GAME));
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return (
        <QueryClientProvider client={client}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useSessionPageData('s1'), { wrapper });

    await waitFor(() => expect(result.current.boardState.ply).toBe(3));
    expect(result.current.chat.messages.map((message) => message.text)).toEqual(['Welcome.', 'Look at 2.Nf3.']);
  });
});
