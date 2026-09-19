import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CoachingCandidateResponse, ImportedGameItem } from '@freechesscoach/shared';

vi.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="mock-chessboard" />
}));

const { ImportPage } = await import('./ImportPage.js');

const LICHESS_GAMES = [
  { id: 'r1', pgn: 'pgn-1', whiteName: 'daniel', blackName: 'Marta', result: '1-0', timeControl: '600+0', playedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'r2', pgn: 'pgn-2', whiteName: 'daniel', blackName: 'Bob', result: '0-1', timeControl: '600+0', playedAt: '2026-07-21T10:00:00.000Z' }
];

function item(id: string, black: string, analysisStatus: ImportedGameItem['analysisStatus']): ImportedGameItem {
  return {
    id, source: 'lichess', userColor: 'white', whiteName: 'daniel', blackName: black, result: '1-0', timeControl: '600+0',
    playedAt: null, createdAt: '2026-07-20T10:00:00.000Z', analysisStatus, sessionId: null, botId: null, reviewTier: 'imported', estimatedRating: null
  };
}

function json(body: unknown, status = 200, type = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
}

interface Api {
  /** What the recent-imports list reports, mutable so a test can advance analysis. */
  listed: ImportedGameItem[];
  candidate: CoachingCandidateResponse;
  /** Which pgns the server refuses with a 429 daily limit. */
  refuse?: string[];
}

function stubApi(api: Api) {
  const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/games/import-quota') return Promise.resolve(json({ daily: { used: 0, limit: 30 }, weekly: { used: 0, limit: 150 }, inFlight: { used: 0, limit: 10 }, library: { used: 5, limit: 1000, autoDeleteCount: 0 } }));
    if (path === '/api/lichess/recent-games') return Promise.resolve(json(LICHESS_GAMES));
    if (path === '/api/users/me/llm-setup') return Promise.resolve(json({ configured: true, unlocked: true, voiceAvailable: false }));
    if (path === '/api/games' && init?.method === 'POST') {
      const { pgn } = JSON.parse(init.body as string) as { pgn: string };
      if (api.refuse?.includes(pgn)) return Promise.resolve(json({ type: 'about:blank', title: 'Import limit reached (30 games/day)', status: 429, limit: 'daily' }, 429, 'application/problem+json'));
      return Promise.resolve(json({ gameId: pgn === 'pgn-1' ? 'g1' : 'g2', analysisId: `a-${pgn}` }));
    }
    if (path.startsWith('/api/games/imported')) return Promise.resolve(json({ items: api.listed, hasMore: false }));
    if (path.startsWith('/api/games/coaching-candidate')) return Promise.resolve(json(api.candidate));
    if (path === '/api/games/g2/promote') return Promise.resolve(json({ reviewTier: 'coach' }));
    if (path === '/api/sessions') return Promise.resolve(json({ id: 'session-1' }));
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderImportPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/import?tab=lichess']}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
          <Route path="/review/:id" element={<div>review-page-marker</div>} />
          <Route path="/games" element={<h1>Games</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function importBothInBulk(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await screen.findByRole('button', { name: /^analyze.*daniel.*marta/is });
  await user.click(screen.getByRole('checkbox', { name: /select several games to import/i }));
  for (const box of screen.getAllByRole('checkbox', { name: /^select daniel/i })) await user.click(box);
  await user.click(screen.getByRole('button', { name: 'Import 2 games' }));
}

describe('ImportPage — after a batch import', () => {
  beforeEach(() => vi.stubGlobal('EventSource', class { close(): void {} }));
  afterEach(() => vi.unstubAllGlobals());

  test('stays on the page and shows per-game progress, including a paused game waiting for the browser', async () => {
    stubApi({ listed: [item('g1', 'Marta', 'engine_running'), item('g2', 'Bob', 'paused')], candidate: { candidate: null } });
    const user = userEvent.setup();
    renderImportPage();

    await importBothInBulk(user);

    expect(await screen.findByRole('region', { name: /analysis progress/i })).toBeInTheDocument();
    expect(await screen.findByText(/waiting for your browser — keep this tab open/i)).toBeInTheDocument();
    expect(screen.getByText('daniel vs. Marta').nextSibling).toHaveTextContent('Reviewing…');
    expect(screen.queryByRole('region', { name: /recommended game/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Games' })).not.toBeInTheDocument();
  });

  test('once every game is ready it recommends the most tactical one, with why', async () => {
    const fetchMock = stubApi({
      listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'ready')],
      candidate: { candidate: { gameId: 'g2', points: 5, topMotifs: [{ motif: 'fork', missed: 4, allowed: 1 }] } }
    });
    const user = userEvent.setup();
    renderImportPage();

    await importBothInBulk(user);

    const card = await screen.findByRole('region', { name: /recommended game/i });
    expect(card).toHaveTextContent('daniel vs. Bob');
    expect(card).toHaveTextContent('Forks — missed 4, allowed 1');
    expect(fetchMock).toHaveBeenCalledWith('/api/games/coaching-candidate?gameIds=g1,g2', expect.anything());
  });

  test('asks for the recommendation only after the whole batch has finished', async () => {
    const fetchMock = stubApi({ listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'engine_running')], candidate: { candidate: null } });
    const user = userEvent.setup();
    renderImportPage();

    await importBothInBulk(user);
    await screen.findByText(/1 of 2 analyzed/i);

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/games/coaching-candidate'), expect.anything());
  });

  test('Start coaching session begins the recommended game\'s session; Review it first opens its review', async () => {
    stubApi({
      listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'ready')],
      candidate: { candidate: { gameId: 'g2', points: 3, topMotifs: [{ motif: 'pin', missed: 3, allowed: 0 }] } }
    });
    const user = userEvent.setup();
    renderImportPage();
    await importBothInBulk(user);

    await user.click(await screen.findByRole('button', { name: 'Start coaching session' }));

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
  });

  test('Review it first opens the recommended game\'s review', async () => {
    stubApi({
      listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'ready')],
      candidate: { candidate: { gameId: 'g2', points: 3, topMotifs: [{ motif: 'pin', missed: 3, allowed: 0 }] } }
    });
    const user = userEvent.setup();
    renderImportPage();
    await importBothInBulk(user);

    await user.click(await screen.findByRole('button', { name: 'Review it first' }));

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
  });

  test('no candidate: only "Go to my games", no recommendation', async () => {
    stubApi({ listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'ready')], candidate: { candidate: null } });
    const user = userEvent.setup();
    renderImportPage();

    await importBothInBulk(user);

    expect(await screen.findByText(/no standout tactics/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /recommended game/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my games' })).toBeInTheDocument();
  });

  test('a game with no tactical points is not recommended', async () => {
    stubApi({ listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'ready')], candidate: { candidate: { gameId: 'g1', points: 0, topMotifs: [] } } });
    const user = userEvent.setup();
    renderImportPage();

    await importBothInBulk(user);

    expect(await screen.findByText(/no standout tactics/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /recommended game/i })).not.toBeInTheDocument();
  });

  test('a partly failed batch still lists the games that did import, and says which limit stopped the rest', async () => {
    stubApi({ listed: [item('g1', 'Marta', 'ready')], candidate: { candidate: null }, refuse: ['pgn-2'] });
    const user = userEvent.setup();
    renderImportPage();

    await importBothInBulk(user);

    expect(await screen.findByText(/imported 1 of 2 games/i)).toBeInTheDocument();
    expect(screen.getByText(/daily import limit reached/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('daniel vs. Marta')).toBeInTheDocument());
    expect(screen.queryByText('daniel vs. Bob')).not.toBeInTheDocument();
  });

  test('Import more games returns to the picker', async () => {
    stubApi({ listed: [item('g1', 'Marta', 'ready'), item('g2', 'Bob', 'ready')], candidate: { candidate: null } });
    const user = userEvent.setup();
    renderImportPage();
    await importBothInBulk(user);

    await user.click(await screen.findByRole('button', { name: 'Import more games' }));

    expect(await screen.findByRole('checkbox', { name: /select several games to import/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /analysis progress/i })).not.toBeInTheDocument();
  });
});
