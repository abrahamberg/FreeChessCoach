import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="mock-chessboard" />
}));

const { ImportPage } = await import('./ImportPage.js');

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function renderImportPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/import']}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
          <Route path="/games" element={<h1>Games</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function submitPgn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /pgn/i }), '1. e4 e5');
  await user.click(screen.getByRole('button', { name: /import/i }));
}

describe('ImportPage', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a 422 missing-color response renders ColorConfirm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ type: 'about:blank', title: 'x', status: 422, missing: 'userColor' }),
        { status: 422, headers: { 'content-type': 'application/problem+json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);

    expect(await screen.findByRole('button', { name: /white/i })).toBeInTheDocument();
  });

  // Regression: a 429 used to render nothing at all, so the Import button just
  // looked dead — no message, no state change, no way to tell what happened.
  test('a rate-limited import surfaces the problem+json title instead of failing silently', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ type: 'about:blank', title: 'Import limit reached (10 games/day)', status: 429 }),
        { status: 429, headers: { 'content-type': 'application/problem+json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Import limit reached (10 games/day)');
  });

  test('an import failure with no problem+json title still surfaces a generic message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t be imported/i);
  });

  test('once the analysis status SSE reports ready, a session is created and the app navigates to it', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games') {
        return Promise.resolve(
          new Response(JSON.stringify({ gameId: 'game-1', analysisId: 'analysis-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      if (path === '/api/sessions') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'session-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    expect(MockEventSource.instances[0]?.url).toBe('/api/analyses/analysis-1/status');

    MockEventSource.instances[0]?.emit({ status: 'ready' });

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions',
      expect.objectContaining({ body: JSON.stringify({ gameId: 'game-1' }) })
    );
  });

  test('design.md §4.2: shows the analysis progress screen (not the form) while waiting', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games') {
        return Promise.resolve(
          new Response(JSON.stringify({ gameId: 'game-1', analysisId: 'analysis-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    expect(screen.queryByRole('textbox', { name: /pgn/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-chessboard')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/reading your game/i);

    MockEventSource.instances[0]?.emit({ status: 'engine_running' });
    expect(await screen.findByRole('status')).toHaveTextContent(/reviewing your game/i);
  });

  test('design.md §4.2: switching to the Upload tab and choosing a file imports it as source upload', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games') {
        return Promise.resolve(
          new Response(JSON.stringify({ gameId: 'game-3', analysisId: 'analysis-3' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await user.click(screen.getByRole('button', { name: /upload/i }));
    const file = new File(['1. e4 e5 *'], 'game.pgn', { type: 'application/x-chess-pgn' });
    await user.upload(screen.getByLabelText(/pgn file/i), file);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({ body: JSON.stringify({ pgn: '1. e4 e5 *', source: 'upload' }) })
      )
    );
  });

  test('switching to the Lichess tab fetches and lists recent games; selecting one imports it as source lichess', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/lichess/recent-games') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'g1',
                pgn: '1. e4 e5 1-0',
                whiteName: 'daniel',
                blackName: 'Marta',
                result: '1-0',
                timeControl: '600+0',
                playedAt: '2026-07-20T10:00:00.000Z'
              }
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      if (path === '/api/games' && init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ gameId: 'game-2', analysisId: 'analysis-2' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await user.click(screen.getByRole('button', { name: /from lichess/i }));

    await user.click(await screen.findByRole('button', { name: /daniel.*marta/is }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({ body: JSON.stringify({ pgn: '1. e4 e5 1-0', source: 'lichess' }) })
      )
    );
  });

  describe('stat-bank bulk import (Task 31.4)', () => {
    const LICHESS_GAMES = [
      {
        id: 'g1',
        pgn: 'pgn-1',
        whiteName: 'daniel',
        blackName: 'Marta',
        result: '1-0',
        timeControl: '600+0',
        playedAt: '2026-07-20T10:00:00.000Z'
      },
      {
        id: 'g2',
        pgn: 'pgn-2',
        whiteName: 'daniel',
        blackName: 'Bob',
        result: '0-1',
        timeControl: '600+0',
        playedAt: '2026-07-21T10:00:00.000Z'
      }
    ];

    async function enterBulkModeWithBothSelected(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: /from lichess/i }));
      await screen.findByRole('button', { name: /daniel.*marta/is });
      await user.click(screen.getByRole('checkbox', { name: /bulk import for stat bank/i }));
      const checkboxes = screen.getAllByRole('checkbox').filter((box) => box.getAttribute('aria-label')?.includes('Select'));
      for (const checkbox of checkboxes) await user.click(checkbox);
    }

    test('a fully-successful batch posts deferAnalysis:true per game and navigates to Games', async () => {
      const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
        if (path === '/api/lichess/recent-games') {
          return Promise.resolve(
            new Response(JSON.stringify(LICHESS_GAMES), { status: 200, headers: { 'content-type': 'application/json' } })
          );
        }
        if (path === '/api/games' && init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ gameId: 'game-x', analysisId: null }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            })
          );
        }
        throw new Error(`unexpected fetch: ${path}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderImportPage();
      await enterBulkModeWithBothSelected(user);

      await user.click(screen.getByRole('button', { name: 'Import 2 for stat bank' }));

      expect(await screen.findByText('Games')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({ body: JSON.stringify({ pgn: 'pgn-1', source: 'lichess', deferAnalysis: true }) })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({ body: JSON.stringify({ pgn: 'pgn-2', source: 'lichess', deferAnalysis: true }) })
      );
    });

    test('a partial failure (rate limit) stays on the page and surfaces the remaining-count message', async () => {
      const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
        if (path === '/api/lichess/recent-games') {
          return Promise.resolve(
            new Response(JSON.stringify(LICHESS_GAMES), { status: 200, headers: { 'content-type': 'application/json' } })
          );
        }
        if (path === '/api/games' && init?.method === 'POST') {
          const body = JSON.parse(init.body as string) as { pgn: string };
          if (body.pgn === 'pgn-1') {
            return Promise.resolve(
              new Response(JSON.stringify({ gameId: 'game-x', analysisId: null }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
              })
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ type: 'about:blank', title: 'Import limit reached (10 games/day)', status: 429 }), {
              status: 429,
              headers: { 'content-type': 'application/problem+json' }
            })
          );
        }
        throw new Error(`unexpected fetch: ${path}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderImportPage();
      await enterBulkModeWithBothSelected(user);

      await user.click(screen.getByRole('button', { name: 'Import 2 for stat bank' }));

      expect(await screen.findByText(/imported 1 of 2 games/i)).toBeInTheDocument();
      expect(screen.getByText(/daily import limit reached/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /go to games/i })).toBeInTheDocument();
    });
  });
});
