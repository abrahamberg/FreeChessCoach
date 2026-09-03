import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import { textFrames } from '../../../test/helpers/uiMessageStream.js';

const capturedOptions: ChessboardOptions[] = [];

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { options: ChessboardOptions }) => {
    capturedOptions.push(props.options);
    return <div data-testid="mock-chessboard" />;
  }
}));

const { PuzzleSessionPage } = await import('./PuzzleSessionPage.js');

const ITEM_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function streamResponse(parts: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } });
}

interface Fixture {
  status?: 'active' | 'completed' | 'paused_no_credits' | 'abandoned';
  currentItemIndex?: number;
  messages?: Array<{ id: string; role: 'user' | 'assistant' | 'tool'; content: unknown; itemIndex: number | null }>;
}

function assignment() {
  return {
    id: 'assignment-1',
    userId: 'u1',
    diagnosisCode: 'TA-07',
    reason: 'You missed several knight forks in your last few games.',
    items: [
      { puzzleId: 'p1', fen: ITEM_FEN, moves: ['e1e2', 'f6g4'], rating: 1500, themes: ['fork'], result: 'pending' },
      { puzzleId: 'p2', fen: ITEM_FEN, moves: ['e1e2', 'f6g4'], rating: 1500, themes: ['fork'], result: 'pending' }
    ],
    status: 'in_progress',
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: '2026-08-01T00:00:00.000Z',
    completedAt: null
  };
}

function mockFetch(fixture: Fixture = {}, streamParts: string[] = textFrames('Hello!')) {
  return vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/puzzle-sessions' && init?.method === 'POST') {
      return Promise.resolve(
        jsonResponse({
          id: 'ps-1',
          assignmentId: 'assignment-1',
          userId: 'u1',
          status: fixture.status ?? 'active',
          currentItemIndex: fixture.currentItemIndex ?? 0,
          startedAt: '2026-08-01T00:00:00.000Z',
          endedAt: null
        })
      );
    }
    if (path === '/api/puzzle-sessions/ps-1' && (init === undefined || init.method === undefined)) {
      return Promise.resolve(
        jsonResponse({
          id: 'ps-1',
          assignmentId: 'assignment-1',
          userId: 'u1',
          status: fixture.status ?? 'active',
          currentItemIndex: fixture.currentItemIndex ?? 0,
          startedAt: '2026-08-01T00:00:00.000Z',
          endedAt: null,
          messages: (fixture.messages ?? []).map((message) => ({
            puzzleSessionId: 'ps-1',
            createdAt: '2026-08-01T00:00:00.000Z',
            ...message
          })),
          assignment: assignment()
        })
      );
    }
    if (path === '/api/puzzle-sessions/ps-1/messages' && init?.method === 'POST') {
      return Promise.resolve(streamResponse(streamParts));
    }
    throw new Error(`unexpected fetch: ${path} ${init?.method ?? 'GET'}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/practice/assignment-1']}>
        <Routes>
          <Route path="/practice/:assignmentId" element={<PuzzleSessionPage />} />
          <Route path="/dashboard" element={<div>dashboard-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PuzzleSessionPage (Task 59.6)', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  afterEach(() => vi.unstubAllGlobals());

  test('creates/resumes the session, then renders the current puzzle\'s position', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderPage();

    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(ITEM_FEN));
  });

  test('a brand-new session (no messages yet) kicks off the opening turn automatically', async () => {
    const fetchMock = mockFetch({ messages: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/puzzle-sessions/ps-1/messages',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({}) })
      )
    );
  });

  test('a resumed session with an existing message for the current item does not re-kick off', async () => {
    const fetchMock = mockFetch({
      messages: [{ id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'Welcome back!' }], itemIndex: 0 }]
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await screen.findByText('Welcome back!');
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/puzzle-sessions/ps-1/messages')).toHaveLength(0);
  });

  test('a streamed reply appears in the chat', async () => {
    vi.stubGlobal('fetch', mockFetch({ messages: [] }, textFrames('Let\'s look at this fork.')));
    renderPage();

    expect(await screen.findByText("Let's look at this fork.")).toBeInTheDocument();
  });

  test('shows a completion state and a way back to the dashboard once the session is completed', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 'completed',
        messages: [{ id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'Done!' }], itemIndex: 1 }]
      })
    );
    renderPage();

    expect(await screen.findByText(/finished this practice set/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to progress/i })).toBeInTheDocument();
  });
});
