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

function renderImportPage(initialPath = '/import') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
          <Route path="/games" element={<h1>Games</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function submitPgn(user: ReturnType<typeof userEvent.setup>, button: 'Analyze' | 'Get coaching session' = 'Get coaching session') {
  await user.type(screen.getByRole('textbox', { name: /pgn/i }), '1. e4 e5');
  await user.click(screen.getByRole('button', { name: button }));
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
    // A fresh Response per call: a body can only be read once, and the page
    // also asks for the import quota.
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 'about:blank', title: 'x', status: 422, missing: 'userColor' }), {
          status: 422,
          headers: { 'content-type': 'application/problem+json' }
        })
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
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 'about:blank', title: 'Import limit reached (30 games/day)', status: 429, limit: 'daily' }), {
          status: 429,
          headers: { 'content-type': 'application/problem+json' }
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Import limit reached (30 games/day)');
  });

  test('an import failure with no problem+json title still surfaces a generic message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await submitPgn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t be imported/i);
  });

  test('choosing Get coaching session: once the analysis status SSE reports ready, a session is created and the app navigates to it', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games') {
        return Promise.resolve(
          new Response(JSON.stringify({ gameId: 'game-1', analysisId: 'analysis-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      if (path === '/api/games/game-1') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'game-1', source: 'paste', reviewTier: 'imported' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      if (path === '/api/games/game-1/promote') {
        return Promise.resolve(
          new Response(JSON.stringify({ reviewTier: 'coach' }), { status: 200, headers: { 'content-type': 'application/json' } })
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
    await user.click(await screen.findByRole('button', { name: 'Analyze' }));

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

    await user.click(await screen.findByRole('button', { name: /^analyze.*daniel.*marta/is }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({
          body: JSON.stringify({ pgn: '1. e4 e5 1-0', source: 'lichess', playedAt: '2026-07-20T10:00:00.000Z' })
        })
      )
    );
  });

  test('switching to the Chess.com tab fetches and lists recent games; selecting one imports it as source chesscom', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/chesscom/recent-games') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'g1',
                pgn: '1. e4 e5 1-0',
                whiteName: 'daniel',
                blackName: 'Marta',
                result: '1-0',
                timeControl: '600',
                playedAt: '2026-07-20T10:00:00.000Z',
                rated: true,
                timeClass: 'rapid',
                whiteRating: 1500,
                blackRating: 1480
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
    await user.click(screen.getByRole('button', { name: /from chess\.com/i }));

    await user.click(await screen.findByRole('button', { name: /^analyze.*daniel.*marta/is }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({
          body: JSON.stringify({ pgn: '1. e4 e5 1-0', source: 'chesscom', playedAt: '2026-07-20T10:00:00.000Z' })
        })
      )
    );
  });

  // Games page's "Import games" shortcuts (Task) link straight into a tab
  // instead of always landing on Paste.
  test('opens directly on the tab named by the ?tab= query param', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/chesscom/recent-games') {
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderImportPage('/import?tab=chesscom');

    expect(screen.getByRole('button', { name: /from chess\.com/i })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText(/no recent games/i);
  });

  test('an unrecognized ?tab= value falls back to Paste instead of crashing', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((path: string) => {
        throw new Error(`unexpected fetch: ${path}`);
      })
    );

    renderImportPage('/import?tab=made-up');

    expect(screen.getByRole('button', { name: /^paste$/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('switching to the Lichess tab with no linked username shows a popup to set one, and saving it refetches the games list', async () => {
    let lichessUsernameSet = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/lichess/recent-games') {
        return Promise.resolve(
          lichessUsernameSet
            ? new Response(
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
            : new Response(
                JSON.stringify({ type: 'about:blank', title: 'Not linked', status: 404 }),
                { status: 404, headers: { 'content-type': 'application/problem+json' } }
              )
        );
      }
      if (path === '/api/users/me' && init?.method === 'PATCH') {
        lichessUsernameSet = true;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: '7d9f2a44-9a5f-4f6e-b1a1-0a4c1e2d3f4b',
              email: 'student@example.com',
              displayName: 'daniel',
              ratingBand: 'club',
              rating: null,
              ratingSource: null,
              lichessUsername: 'daniel',
              chesscomUsername: null,
              selfAssessment: null,
              engineMode: 'native',
              coachPersona: 'general',
              ttsEnabled: false,
              ttsBackend: 'openai'
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderImportPage();
    await user.click(screen.getByRole('button', { name: /from lichess/i }));

    expect(await screen.findByRole('dialog', { name: /set your lichess username/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^lichess username$/i), 'daniel');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/users/me',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ lichessUsername: 'daniel' }) })
      )
    );
    expect(await screen.findByRole('button', { name: /^analyze.*daniel.*marta/is })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
      await screen.findByRole('button', { name: /^analyze.*daniel.*marta/is });
      await user.click(screen.getByRole('checkbox', { name: /select several games to import/i }));
      const checkboxes = screen.getAllByRole('checkbox').filter((box) => box.getAttribute('aria-label')?.includes('Select'));
      for (const checkbox of checkboxes) await user.click(checkbox);
    }

    // The batch is sequential (one request per game), so the picker should
    // show that games are landing one at a time — not a single frozen label
    // until the whole thing finishes.
    test('checks off each row and updates the count as its own import settles, instead of all at once at the end', async () => {
      let resolveFirst!: (response: Response) => void;
      let resolveSecond!: (response: Response) => void;
      const firstGameImported = new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
      const secondGameImported = new Promise<Response>((resolve) => {
        resolveSecond = resolve;
      });
      const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
        if (path === '/api/lichess/recent-games') {
          return Promise.resolve(
            new Response(JSON.stringify(LICHESS_GAMES), { status: 200, headers: { 'content-type': 'application/json' } })
          );
        }
        if (path === '/api/games' && init?.method === 'POST') {
          const body = JSON.parse(init.body as string) as { pgn: string };
          return body.pgn === 'pgn-1' ? firstGameImported : secondGameImported;
        }
        throw new Error(`unexpected fetch: ${path}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderImportPage();
      await enterBulkModeWithBothSelected(user);

      await user.click(screen.getByRole('button', { name: 'Import 2 games' }));

      // First game's request is still pending: the button reflects 0 of 2
      // done, and no row has been checked off yet.
      expect(await screen.findByRole('button', { name: 'Importing 0 of 2…' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Imported')).not.toBeInTheDocument();

      resolveFirst(
        new Response(JSON.stringify({ gameId: 'game-x', analysisId: 'analysis-x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

      // First game settles while the second one is still in flight: exactly
      // one row is checked off, and the count reflects that mid-batch state.
      await waitFor(() => expect(screen.getAllByLabelText('Imported')).toHaveLength(1));
      expect(screen.getByRole('button', { name: /importing 1 of 2/i })).toBeInTheDocument();

      resolveSecond(
        new Response(JSON.stringify({ gameId: 'game-y', analysisId: 'analysis-y' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

      await waitFor(() => expect(screen.getByText('Games')).toBeInTheDocument());
    });

    // Engine analysis has no AI/BYOK-unlock dependency, so a bulk import
    // queues it per game exactly like a single-game import does — no
    // deferAnalysis, no manual "Get coach analysis" click needed afterward.
    test('a fully-successful batch queues analysis per game (no deferAnalysis) and navigates to Games', async () => {
      const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
        if (path === '/api/lichess/recent-games') {
          return Promise.resolve(
            new Response(JSON.stringify(LICHESS_GAMES), { status: 200, headers: { 'content-type': 'application/json' } })
          );
        }
        if (path === '/api/games' && init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ gameId: 'game-x', analysisId: 'analysis-x' }), {
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

      await user.click(screen.getByRole('button', { name: 'Import 2 games' }));

      expect(await screen.findByText('Games')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({
          body: JSON.stringify({ pgn: 'pgn-1', source: 'lichess', playedAt: '2026-07-20T10:00:00.000Z' })
        })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games',
        expect.objectContaining({
          body: JSON.stringify({ pgn: 'pgn-2', source: 'lichess', playedAt: '2026-07-21T10:00:00.000Z' })
        })
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
            new Response(JSON.stringify({ type: 'about:blank', title: 'Import limit reached (30 games/day)', status: 429, limit: 'daily' }), {
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

      await user.click(screen.getByRole('button', { name: 'Import 2 games' }));

      expect(await screen.findByText(/imported 1 of 2 games/i)).toBeInTheDocument();
      expect(screen.getByText(/daily import limit reached/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /go to games/i })).toBeInTheDocument();
    });

    test('switching from Lichess to Chess.com clears the selection instead of carrying over stale ids', async () => {
      const CHESSCOM_GAMES = [
        {
          id: 'c1',
          pgn: 'chesscom-pgn-1',
          whiteName: 'daniel',
          blackName: 'Nadia',
          result: '1-0',
          timeControl: '600',
          playedAt: '2026-07-22T10:00:00.000Z',
          rated: true,
          timeClass: 'rapid',
          whiteRating: 1500,
          blackRating: 1480
        }
      ];
      const fetchMock = vi.fn().mockImplementation((path: string) => {
        if (path === '/api/lichess/recent-games') {
          return Promise.resolve(
            new Response(JSON.stringify(LICHESS_GAMES), { status: 200, headers: { 'content-type': 'application/json' } })
          );
        }
        if (path === '/api/chesscom/recent-games') {
          return Promise.resolve(
            new Response(JSON.stringify(CHESSCOM_GAMES), { status: 200, headers: { 'content-type': 'application/json' } })
          );
        }
        throw new Error(`unexpected fetch: ${path}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderImportPage();
      await enterBulkModeWithBothSelected(user);
      expect(screen.getByRole('button', { name: 'Import 2 games' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /from chess\.com/i }));
      await screen.findByRole('checkbox', { name: /select daniel.*nadia to import/is });

      expect(screen.getByRole('button', { name: 'Import 0 games' })).toBeDisabled();
    });
  });
});
