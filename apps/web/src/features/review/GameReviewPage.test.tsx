import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';

const capturedOptions: ChessboardOptions[] = [];

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { options: ChessboardOptions }) => {
    capturedOptions.push(props.options);
    return <div data-testid="mock-chessboard" />;
  }
}));

const { GameReviewPage } = await import('./GameReviewPage.js');

const PGN = '[White "daniel"]\n[Black "Marta"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 *';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

interface GameFixture {
  reviewTier?: 'imported' | 'bot' | 'review' | 'coach';
  classifiedMoves?: unknown[] | null;
  gameReport?: unknown | null;
}

function mockFetch(game: GameFixture = {}) {
  return vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/games/game-1') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'game-1',
            pgn: PGN,
            userColor: 'white',
            whiteName: 'daniel',
            blackName: 'Marta',
            result: '1-0',
            classifiedMoves: game.classifiedMoves ?? null,
            reviewTier: game.reviewTier ?? 'imported',
            gameReport: game.gameReport ?? null
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    }
    if (path === '/api/games/game-1/promote' && init?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ reviewTier: 'coach' }), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    }
    if (path === '/api/sessions' && init?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'session-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
}

function renderReviewPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/review/game-1']}>
        <Routes>
          <Route path="/review/:gameId" element={<GameReviewPage />} />
          <Route path="/games" element={<div>games-page-marker</div>} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GameReviewPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    capturedOptions.length = 0;
  });

  test('shows the players once the game loads, with no chat pane', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    renderReviewPage();

    expect(await screen.findByText(/daniel/)).toBeInTheDocument();
    expect(screen.getByText(/marta/i)).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  test('the back button navigates to the Games list', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();
    await screen.findByText(/daniel/);

    await user.click(screen.getByRole('button', { name: /back to games/i }));

    expect(await screen.findByText('games-page-marker')).toBeInTheDocument();
  });

  test('shows a move-quality icon for a classified move', async () => {
    mockMatchMedia(false);
    vi.stubGlobal(
      'fetch',
      mockFetch({
        classifiedMoves: [
          {
            ply: 3,
            moveSan: 'Nf3',
            mover: 'white',
            isUserMove: true,
            cpLoss: 0,
            quality: 'blunder',
            bestLineSan: ['Nc3'],
            evalAfterCp: -400,
            hangsPiece: true
          }
        ]
      })
    );
    renderReviewPage();

    expect(await screen.findByRole('button', { name: '??Nf3' })).toHaveClass('move-quality-blunder');
  });

  test('"Continue with Coach" is hidden once a game is already at the coach tier', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch({ reviewTier: 'coach' }));
    renderReviewPage();

    await screen.findByText(/daniel/);
    expect(screen.queryByRole('button', { name: /continue with coach/i })).not.toBeInTheDocument();
  });

  test('"Continue with Coach" promotes the game, then starts and opens a coaching session', async () => {
    mockMatchMedia(false);
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderReviewPage();
    await screen.findByText(/daniel/);

    await user.click(screen.getByRole('button', { name: 'Continue with Coach' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/game-1/promote',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ tier: 'coach' }) })
      )
    );
    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
  });

  test('clicking a move in the move list updates the board position', async () => {
    mockMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();

    await user.click(await screen.findByText('e5'));

    await waitFor(() => {
      const latest = capturedOptions[capturedOptions.length - 1];
      expect(latest?.position).toContain('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
    });
  });
});
