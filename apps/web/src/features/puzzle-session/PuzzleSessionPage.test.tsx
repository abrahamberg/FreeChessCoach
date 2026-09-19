import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions, PieceDropHandlerArgs } from 'react-chessboard';
import { textFrames } from '../../../test/helpers/uiMessageStream.js';

const capturedOptions: ChessboardOptions[] = [];

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { options: ChessboardOptions }) => {
    capturedOptions.push(props.options);
    return <div data-testid="mock-chessboard" />;
  }
}));

const { PuzzleSessionPage } = await import('./PuzzleSessionPage.js');

// 1.e4 e5 2.Nf3 Nc6 — moves[0] is the "opponent's setup move" convention
// (puzzle-coach-system.ts); currentPly starts at 1, so the live position is
// already past it, and e7e5 is the student's next expected move.
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const LINE = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

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
  status?: 'active' | 'completed' | 'abandoned';
  currentItemIndex?: number;
  currentPly?: number;
  currentFen?: string;
  messages?: Array<{ id: string; role: 'user' | 'assistant' | 'tool'; content: unknown; itemIndex: number | null }>;
  /** Forces attempt-move's response to report the line as fully played out
   * on an accepted move, regardless of how many moves the fixture's LINE
   * actually has — isolates the "next puzzle" UI from needing a realistic
   * multi-move solve in every test that exercises it. */
  lineCompleteOnAccept?: boolean;
}

function assignment() {
  return {
    id: 'assignment-1',
    userId: 'u1',
    diagnosisCode: 'TA-07',
    reason: 'You missed several knight forks in your last few games.',
    items: [
      { puzzleId: 'p1', fen: START_FEN, moves: LINE, rating: 1500, themes: ['fork'], result: 'pending' },
      { puzzleId: 'p2', fen: START_FEN, moves: LINE, rating: 1500, themes: ['fork'], result: 'pending' }
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
          currentPly: fixture.currentPly ?? 1,
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
          currentPly: fixture.currentPly ?? 1,
          currentFen: fixture.currentFen ?? AFTER_E4,
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
    if (path === '/api/puzzle-sessions/ps-1/attempt-move' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { san: string; uci: string };
      const accepted = body.uci === 'e7e5';
      return Promise.resolve(
        jsonResponse(
          accepted
            ? { accepted: true, fen: AFTER_E4_E5_NF3, currentPly: 3, lineComplete: fixture.lineCompleteOnAccept ?? false }
            : { accepted: false, fen: AFTER_E4, currentPly: 1, lineComplete: false }
        )
      );
    }
    if (path === '/api/puzzle-sessions/ps-1/advance-item' && init?.method === 'POST') {
      return Promise.resolve(jsonResponse({ itemIndex: fixture.currentItemIndex ?? 0, isLastItem: false }));
    }
    if (path === '/api/puzzle-sessions/ps-1/messages' && init?.method === 'POST') {
      return Promise.resolve(streamResponse(streamParts));
    }
    // BoardActionBar's Explore toggle/Hint button both hit this once opened
    // — an empty line list is enough for tests that don't assert on the
    // resulting eval pill/hint highlights themselves.
    if (path === '/api/positions/hint-moves' && init?.method === 'POST') {
      return Promise.resolve(jsonResponse({ lines: [] }));
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
          <Route path="/progress" element={<div>progress-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function dropPiece(sourceSquare: string, targetSquare: string): void {
  const options = capturedOptions.at(-1);
  act(() => {
    options?.onPieceDrop?.({
      piece: { pieceType: 'wP' },
      sourceSquare,
      targetSquare
    } as PieceDropHandlerArgs);
  });
}

describe('PuzzleSessionPage (Task 59.6)', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  afterEach(() => vi.unstubAllGlobals());

  test('creates/resumes the session, then renders the current live position (past the auto-played setup move)', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderPage();

    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4));
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

  test('shows a completion popup naming the assigned focus area, with a way back to the dashboard', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 'completed',
        messages: [{ id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'Done!' }], itemIndex: 1 }]
      })
    );
    renderPage();

    expect(await screen.findByText(/you did it/i)).toBeInTheDocument();
    expect(screen.getByText(/knight forks in your last few games/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to progress/i })).toBeInTheDocument();
  });

  test('a move matching the line commits: the board adopts the new position and the coach is told it matched', async () => {
    const fetchMock = mockFetch({ messages: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4));

    dropPiece('e7', 'e5');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/puzzle-sessions/ps-1/attempt-move',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ san: 'e5', uci: 'e7e5' }) })
      )
    );
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4_E5_NF3));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/puzzle-sessions/ps-1/messages',
      expect.objectContaining({ body: JSON.stringify({ content: '[move_attempt] I played e5 — on the line.' }) })
    );
  });

  test('a move committed after clicking Hint tells the coach a hint was used', async () => {
    const fetchMock = mockFetch({ messages: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4));

    act(() => screen.getByText('Hint').click());

    dropPiece('e7', 'e5');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/puzzle-sessions/ps-1/messages',
        expect.objectContaining({ body: JSON.stringify({ content: '[move_attempt] I played e5 — on the line. (used a hint)' }) })
      )
    );
  });

  test('a move off the line reverts the board and tells the coach it was not on the line', async () => {
    const fetchMock = mockFetch({ messages: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4));

    dropPiece('g8', 'f6'); // legal, but not the known e7e5

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/puzzle-sessions/ps-1/attempt-move',
        expect.objectContaining({ body: JSON.stringify({ san: 'Nf6', uci: 'g8f6' }) })
      )
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/puzzle-sessions/ps-1/messages',
        expect.objectContaining({ body: JSON.stringify({ content: '[move_attempt] I tried Nf6 — not on the line, reverted.' }) })
      )
    );
    // Reverted — the board is back at the last-committed position, not the
    // student's own attempt.
    expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4);
  });

  test('"explore on your own" lets the student move freely without submitting an attempt', async () => {
    const fetchMock = mockFetch({ messages: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4));

    const exploreButton = await screen.findByRole('button', { name: /explore on your own/i });
    act(() => exploreButton.click());

    dropPiece('e7', 'e6'); // not the known move, but exploring shouldn't care

    await waitFor(() => expect(capturedOptions.at(-1)?.position).not.toBe(AFTER_E4));
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/puzzle-sessions/ps-1/attempt-move')).toBe(false);
  });

  test('shows a numbered status for each assigned puzzle, current one highlighted', async () => {
    vi.stubGlobal('fetch', mockFetch({ messages: [] }));
    renderPage();

    await screen.findByTestId('mock-chessboard');
    const first = screen.getByTitle(/puzzle 1 —/i);
    const second = screen.getByTitle(/puzzle 2 —/i);
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).not.toHaveAttribute('aria-current');
  });

  test('a "next puzzle" action appears once the line is complete, and does not depend on the coach calling advance_puzzle', async () => {
    const fetchMock = mockFetch({ messages: [], lineCompleteOnAccept: true });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByTestId('mock-chessboard');
    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe(AFTER_E4));

    dropPiece('e7', 'e5');

    const nextButton = await screen.findByRole('button', { name: /next puzzle/i });
    act(() => nextButton.click());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/puzzle-sessions/ps-1/advance-item', expect.objectContaining({ method: 'POST' }))
    );
  });
});
