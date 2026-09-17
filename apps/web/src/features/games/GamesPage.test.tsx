import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GamesPage } from './GamesPage.js';

// Same mock shape useAnalysisStatus.test.ts already established for the SSE
// endpoints this app streams status over.
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

const GAMES_RESPONSE = [
  {
    id: 'g1',
    source: 'paste',
    userColor: 'white',
    whiteName: 'daniel',
    blackName: 'Marta',
    result: '1-0',
    timeControl: '10+0',
    playedAt: '2026-07-20T10:00:00.000Z',
    createdAt: '2026-07-20T10:05:00.000Z',
    analysisStatus: 'ready',
    sessionId: null,
    botId: null,
    reviewTier: 'imported'
  }
];

const PLAY_MODE_GAME = {
  id: 'g2',
  source: 'coach_play',
  userColor: 'white',
  whiteName: 'daniel',
  blackName: 'Coach',
  result: null,
  timeControl: null,
  playedAt: null,
  createdAt: '2026-08-05T10:05:00.000Z',
  analysisStatus: null,
  sessionId: 'session-2',
  botId: null,
  reviewTier: 'coach'
};

function renderGamesPage(games: unknown[] = GAMES_RESPONSE, { deleteStatus = 204 }: { deleteStatus?: number } = {}) {
  let currentGames = games;
  const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/games') {
      return Promise.resolve(
        new Response(JSON.stringify(currentGames), { status: 200, headers: { 'content-type': 'application/json' } })
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
    if (typeof path === 'string' && path.startsWith('/api/games/') && init?.method === 'DELETE') {
      if (deleteStatus === 204) {
        currentGames = currentGames.filter((game) => (game as { id: string }).id !== path.split('/').pop());
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(null, { status: deleteStatus }));
    }
    if (typeof path === 'string' && path.endsWith('/pgn') && (init === undefined || init.method === undefined)) {
      return Promise.resolve(new Response('1. e4 e5 *', { status: 200, headers: { 'content-type': 'application/x-chess-pgn' } }));
    }
    if (typeof path === 'string' && path.endsWith('/analyze') && init?.method === 'POST') {
      const gameId = path.split('/')[3];
      currentGames = currentGames.map((game) =>
        (game as { id: string }).id === gameId ? { ...(game as object), analysisStatus: 'queued' } : game
      );
      return Promise.resolve(
        new Response(JSON.stringify({ analysisId: 'analysis-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    }
    if (typeof path === 'string' && path.endsWith('/promote') && init?.method === 'POST') {
      const gameId = path.split('/')[3];
      const { tier } = JSON.parse(init.body as string) as { tier: string };
      currentGames = currentGames.map((game) =>
        (game as { id: string }).id === gameId ? { ...(game as object), reviewTier: tier } : game
      );
      return Promise.resolve(
        new Response(JSON.stringify({ reviewTier: tier }), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/games']}>
        <Routes>
          <Route path="/games" element={<GamesPage />} />
          <Route path="/import" element={<div>import-page-marker</div>} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
          <Route path="/bot-session/:id" element={<div>bot-session-page-marker</div>} />
          <Route path="/review/:gameId" element={<div>review-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

async function deleteFirstGame(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Delete game' }));
}

describe('GamesPage (Daniel\'s IA feedback: games are all the same thing, source is metadata)', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('fetches and lists the user\'s games', async () => {
    renderGamesPage();
    expect(await screen.findByText('daniel')).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
  });

  test('the "Add games" CTA navigates to Import', async () => {
    const user = userEvent.setup();
    renderGamesPage();
    await screen.findByText('daniel');

    await user.click(screen.getByRole('link', { name: /add games/i }));
    expect(await screen.findByText('import-page-marker')).toBeInTheDocument();
  });

  test('the "Review" action on a ready game navigates to its Review page without touching sessions', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('daniel');

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  // A ready game not yet at the coach tier promotes it first, then starts
  // (or resumes) its coaching session — Review and Coach are always shown
  // together, so there's no tab to switch to first.
  test('the "Coach" action on a ready, unpromoted game promotes it and starts a session', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('daniel');

    await user.click(screen.getByRole('button', { name: 'Coach' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/g1/promote',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ tier: 'coach' }) })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({ body: JSON.stringify({ gameId: 'g1' }) }));
    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
  });

  // A game already at the coach tier skips the (now redundant) promote call
  // and goes straight to finding-or-creating its session.
  test('the "Coach" action on a game already at the coach tier skips promoting and opens the session directly', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage([{ ...GAMES_RESPONSE[0], reviewTier: 'coach' }]);
    await screen.findByText('daniel');

    await user.click(screen.getByRole('button', { name: 'Coach' }));

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/g1/promote', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({ body: JSON.stringify({ gameId: 'g1' }) }));
  });

  test('tabs filter games by source, defaulting to All', async () => {
    const user = userEvent.setup();
    renderGamesPage([GAMES_RESPONSE[0], { ...GAMES_RESPONSE[0], id: 'g3', whiteName: 'bottest', source: 'vs_bot', reviewTier: 'bot' }]);

    expect(await screen.findByText('daniel')).toBeInTheDocument();
    expect(screen.getByText('bottest')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Bot' }));
    expect(await screen.findByText('bottest')).toBeInTheDocument();
    expect(screen.queryByText('daniel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Imported' }));
    expect(await screen.findByText('daniel')).toBeInTheDocument();
    expect(screen.queryByText('bottest')).not.toBeInTheDocument();
  });

  // architecture §14: a coach_play/vs_bot row with a live session surfaces
  // above the source-filtered list, not just inside whichever tab it falls
  // under — this is the thing the student most likely came back to finish.
  test('an in-progress play-mode game shows in a "Continue" section, and its action navigates straight to its session', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage([GAMES_RESPONSE[0], PLAY_MODE_GAME]);
    // Both fixtures have 'daniel' as White — wait on the unique name instead.
    await screen.findByText('Marta');

    expect(screen.getByRole('heading', { name: 'Continue' })).toBeInTheDocument();
    const continueSection = screen.getByRole('region', { name: 'Continue' });
    expect(continueSection).toHaveTextContent('daniel vs Coach');

    // The same in-progress game may also appear as a row further down the
    // source-filtered list — scope to the "Continue" section itself so the
    // click is unambiguous.
    await user.click(within(continueSection).getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  test('no "Continue" section when nothing is in progress', async () => {
    renderGamesPage();
    await screen.findByText('daniel');
    expect(screen.queryByRole('heading', { name: 'Continue' })).not.toBeInTheDocument();
  });

  test('shows a friendly empty state with no games and no dummy data', async () => {
    renderGamesPage([]);
    expect(await screen.findByText(/no games yet|add your first game/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  test('deleting a game confirms, calls DELETE, and removes it from the list', async () => {
    const fetchMock = renderGamesPage();
    await screen.findByText('daniel');

    await deleteFirstGame();

    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1', expect.objectContaining({ method: 'DELETE' }));
    expect(await screen.findByText(/no games yet|add your first game/i)).toBeInTheDocument();
  });

  test('canceling the confirmation dialog does not delete the game', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('daniel');

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/g1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText('daniel')).toBeInTheDocument();
  });

  test('"Copy PGN" fetches the game\'s PGN and writes it to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fetchMock = renderGamesPage();
    await screen.findByText('daniel');

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy PGN' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('1. e4 e5 *'));
    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/pgn', expect.objectContaining({ credentials: 'include' }));
  });

  test('shows an error message if deleting a game fails', async () => {
    renderGamesPage(GAMES_RESPONSE, { deleteStatus: 500 });
    await screen.findByText('daniel');

    await deleteFirstGame();

    expect(await screen.findByText(/could not delete/i)).toBeInTheDocument();
    expect(screen.getByText('daniel')).toBeInTheDocument();
  });

  // Phase 31 stat-bank import: a deferAnalysis-imported game with no
  // `analyses` row yet gets a "Not analyzed" status and a "Get coach
  // analysis" action that starts analysis without leaving the Games list.
  test('clicking "Get coach analysis" on a not-analyzed game starts analysis and flips its status', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage([{ ...GAMES_RESPONSE[0], analysisStatus: null }]);
    await screen.findByText('daniel');

    expect(screen.getByText('Not analyzed', { selector: 'span' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get coach analysis' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/analyze', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Analyzing…')).toBeInTheDocument();
  });

  // The bug this session's SSE fix addresses: a row used to stay on
  // "Analyzing…" forever once the initial fetch landed — nothing on this
  // page ever learned the background job had finished short of a manual
  // reload or a window-focus refetch. GET /api/analyses/active (the same SSE
  // stream the topbar engine indicator already watches) reports every
  // in-progress analysis; the moment a gameId drops out of that stream is
  // the signal used here to refetch ['games'] and pick up the real,
  // now-terminal status.
  test('a row updates itself once its background analysis finishes, via the active-analyses SSE stream', async () => {
    let currentGames: unknown[] = [{ ...GAMES_RESPONSE[0], analysisStatus: 'engine_running' }];
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games') {
        return Promise.resolve(
          new Response(JSON.stringify(currentGames), { status: 200, headers: { 'content-type': 'application/json' } })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/games']}>
          <Routes>
            <Route path="/games" element={<GamesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Analyzing…');
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe('/api/analyses/active');

    // Still running — reported in the active-analyses frame.
    act(() => {
      MockEventSource.instances[0]?.emit({
        engineMode: 'native',
        analyses: [{ analysisId: 'a1', gameId: 'g1', status: 'engine_running', analyzedPositions: 3, totalPositions: 10 }]
      });
    });
    expect(screen.getByText('Analyzing…')).toBeInTheDocument();

    // Finishes server-side; the next frame simply no longer mentions it.
    currentGames = [{ ...GAMES_RESPONSE[0], analysisStatus: 'ready' }];
    act(() => {
      MockEventSource.instances[0]?.emit({ engineMode: 'native', analyses: [] });
    });

    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText('Analyzing…')).not.toBeInTheDocument();
  });

  test('a failed-to-analyse game has no action button, and can still be deleted from the overflow menu', async () => {
    renderGamesPage([{ ...GAMES_RESPONSE[0], analysisStatus: 'failed' }]);
    await screen.findByText('daniel');

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review|coach/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });
});
