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

const RECENT_GAME = {
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
  reviewTier: 'imported',
  estimatedRating: 1432
};

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

const PRACTICE_ASSIGNMENT = {
  id: 'assignment-1',
  userId: 'u1',
  diagnosisCode: 'TA-07',
  reason: 'You missed several knight forks recently.',
  items: [
    { puzzleId: 'p1', fen: 'fen-1', moves: ['e2e4'], rating: 1500, themes: ['fork'], result: 'solved' },
    { puzzleId: 'p2', fen: 'fen-2', moves: ['e2e4'], rating: 1500, themes: ['fork'], result: 'pending' }
  ],
  status: 'in_progress',
  createdAt: '2026-08-01T00:00:00.000Z',
  startedAt: '2026-08-01T00:00:00.000Z',
  completedAt: null
};

interface RenderOptions {
  recent?: unknown[];
  inProgress?: unknown[];
  practiceAssignments?: unknown[];
  deleteStatus?: number;
  llmConfigured?: boolean;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function renderGamesPage({
  recent = [RECENT_GAME],
  inProgress = [],
  practiceAssignments = [],
  deleteStatus = 204,
  llmConfigured = true
}: RenderOptions = {}) {
  let currentRecent = recent;
  let currentInProgress = inProgress;
  const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/games/imported?limit=15') return Promise.resolve(jsonResponse({ items: currentRecent, hasMore: false }));
    if (path === '/api/games/in-progress') return Promise.resolve(jsonResponse(currentInProgress));
    if (path === '/api/games/import-quota') return Promise.resolve(jsonResponse({ used: 3, limit: 10 }));
    if (path === '/api/puzzle-assignments') return Promise.resolve(jsonResponse(practiceAssignments));
    if (path === '/api/users/me/llm-setup') {
      return Promise.resolve(jsonResponse({ configured: llmConfigured, unlocked: llmConfigured, voiceAvailable: false }));
    }
    if (path === '/api/sessions') return Promise.resolve(jsonResponse({ id: 'session-1' }));
    if (typeof path === 'string' && path.startsWith('/api/games/') && init?.method === 'DELETE') {
      if (deleteStatus !== 204) return Promise.resolve(new Response(null, { status: deleteStatus }));
      const gameId = path.split('/').pop();
      currentRecent = currentRecent.filter((game) => (game as { id: string }).id !== gameId);
      currentInProgress = currentInProgress.filter((game) => (game as { id: string }).id !== gameId);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (typeof path === 'string' && path.endsWith('/analyze') && init?.method === 'POST') {
      const gameId = path.split('/')[3];
      currentRecent = currentRecent.map((game) =>
        (game as { id: string }).id === gameId ? { ...(game as object), analysisStatus: 'queued' } : game
      );
      return Promise.resolve(jsonResponse({ analysisId: 'analysis-1' }));
    }
    if (typeof path === 'string' && path.endsWith('/promote') && init?.method === 'POST') {
      return Promise.resolve(jsonResponse({ reviewTier: 'coach' }));
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
          <Route path="/games/find" element={<div>find-page-marker</div>} />
          <Route path="/import" element={<div>import-page-marker</div>} />
          <Route path="/settings" element={<div>settings-page-marker</div>} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
          <Route path="/bot-session/:id" element={<div>bot-session-page-marker</div>} />
          <Route path="/review/:gameId" element={<div>review-page-marker</div>} />
          <Route path="/practice/:assignmentId" element={<div>practice-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

describe('GamesPage (rails: Practice, Continue, Recently imported)', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('lists the recently imported games on their own rail, with no source tabs', async () => {
    renderGamesPage();
    const recent = await screen.findByRole('region', { name: 'Recently imported' });

    expect(within(recent).getByText('daniel')).toBeInTheDocument();
    expect(within(recent).getByText('Marta')).toBeInTheDocument();
    expect(within(recent).getByText(/~1432/)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your games' })).not.toBeInTheDocument();
  });

  test('the "Find game" button opens the full list', async () => {
    const user = userEvent.setup();
    renderGamesPage();
    await screen.findByText('Marta');

    await user.click(screen.getByRole('link', { name: /find game/i }));

    expect(await screen.findByText('find-page-marker')).toBeInTheDocument();
  });

  test('the "Import games" section shows every import path and each shortcut navigates to its Import tab', async () => {
    const user = userEvent.setup();
    renderGamesPage();
    await screen.findByText('Marta');

    const importSection = screen.getByRole('region', { name: /import games/i });
    for (const label of [/lichess/i, /chess\.com/i, /paste pgn/i, /upload pgn/i]) {
      expect(within(importSection).getByRole('link', { name: label })).toBeInTheDocument();
    }

    await user.click(within(importSection).getByRole('link', { name: /lichess/i }));
    expect(await screen.findByText('import-page-marker')).toBeInTheDocument();
  });

  test('the "Import games" section shows how much of today\'s import quota has been used', async () => {
    renderGamesPage();
    expect(await screen.findByText(/3 of 10 imported today/i)).toBeInTheDocument();
  });

  test('a card\'s "Review" icon button navigates to the Review page without touching sessions', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('Marta');

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  test('every card action is an icon button with a tooltip', async () => {
    renderGamesPage();
    await screen.findByText('Marta');

    expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute('title', 'Review');
    expect(screen.getByRole('button', { name: 'Coach' })).toHaveAttribute('title', 'Coach');
    expect(screen.getByRole('button', { name: /delete daniel vs\. marta/i })).toHaveAttribute('title', 'Delete game');
  });

  test('"Coach" on a ready, unpromoted game promotes it and starts a session', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('Marta');

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

  test('"Coach" on a game already at the coach tier skips promoting and opens the session directly', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage({ recent: [{ ...RECENT_GAME, reviewTier: 'coach' }] });
    await screen.findByText('Marta');

    await user.click(screen.getByRole('button', { name: 'Coach' }));

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/g1/promote', expect.anything());
  });

  // BYOK gate: no saved AI key means the coach can't answer, so Coach shows
  // the same "AI setup needed" popup a keyless coaching turn already shows,
  // instead of opening a session that can't work.
  test('"Coach" without an AI key shows the setup popup and does not start a session', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage({ llmConfigured: false });
    await screen.findByText('Marta');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/me/llm-setup', expect.anything()));

    await user.click(screen.getByRole('button', { name: 'Coach' }));

    expect(await screen.findByRole('dialog', { name: /ai setup needed/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/g1/promote', expect.anything());
  });

  test('the setup popup can send the student to Settings', async () => {
    const user = userEvent.setup();
    renderGamesPage({ llmConfigured: false });
    await screen.findByText('Marta');
    await user.click(screen.getByRole('button', { name: 'Coach' }));

    await user.click(await screen.findByRole('button', { name: 'Go to Settings' }));

    expect(await screen.findByText('settings-page-marker')).toBeInTheDocument();
  });

  test('the setup popup can fall back to the free Review of that game', async () => {
    const user = userEvent.setup();
    renderGamesPage({ llmConfigured: false });
    await screen.findByText('Marta');
    await user.click(screen.getByRole('button', { name: 'Coach' }));

    await user.click(await screen.findByRole('button', { name: 'Analyze without AI' }));

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
  });

  test('"Review" is never gated on an AI key', async () => {
    const user = userEvent.setup();
    renderGamesPage({ llmConfigured: false });
    await screen.findByText('Marta');

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
  });

  test('an in-progress play-mode game shows on the Continue rail, and Continue navigates straight to its session', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage({ inProgress: [PLAY_MODE_GAME] });
    const continueSection = await screen.findByRole('region', { name: 'Continue' });
    expect(continueSection).toHaveTextContent('daniel vs Coach');

    await user.click(within(continueSection).getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  test('a Continue card\'s red trash can confirms before deleting the game', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage({ recent: [], inProgress: [PLAY_MODE_GAME] });
    const continueSection = await screen.findByRole('region', { name: 'Continue' });

    await user.click(within(continueSection).getByRole('button', { name: /delete daniel vs\. coach/i }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/g2', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/daniel vs\. coach/i);

    await user.click(screen.getByRole('button', { name: 'Delete game' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/games/g2', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Continue' })).not.toBeInTheDocument());
  });

  test('no Continue or Practice section when nothing is in progress or assigned', async () => {
    renderGamesPage();
    await screen.findByText('Marta');
    expect(screen.queryByRole('region', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Practice' })).not.toBeInTheDocument();
  });

  test('an open practice assignment gets its own Practice section above Continue, linking to the practice session', async () => {
    const user = userEvent.setup();
    renderGamesPage({ inProgress: [PLAY_MODE_GAME], practiceAssignments: [PRACTICE_ASSIGNMENT] });
    const practiceSection = await screen.findByRole('region', { name: 'Practice' });
    const continueSection = await screen.findByRole('region', { name: 'Continue' });

    expect(practiceSection.compareDocumentPosition(continueSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(practiceSection).toHaveTextContent('You missed several knight forks recently.');
    expect(practiceSection).toHaveTextContent('1 of 2 puzzles');
    expect(continueSection).not.toHaveTextContent('knight forks');

    await user.click(within(practiceSection).getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('practice-page-marker')).toBeInTheDocument();
  });

  test('shows a friendly empty state with no games and no dummy data', async () => {
    renderGamesPage({ recent: [] });
    expect(await screen.findByText(/no games yet|add your first game/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recently imported' })).not.toBeInTheDocument();
  });

  test('deleting a recently imported game confirms, calls DELETE, and removes it', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('Marta');

    await user.click(screen.getByRole('button', { name: /delete daniel vs\. marta/i }));
    await user.click(screen.getByRole('button', { name: 'Delete game' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1', expect.objectContaining({ method: 'DELETE' }));
    expect(await screen.findByText(/no games yet|add your first game/i)).toBeInTheDocument();
  });

  test('canceling the confirmation dialog does not delete the game', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage();
    await screen.findByText('Marta');

    await user.click(screen.getByRole('button', { name: /delete daniel vs\. marta/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/g1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText('Marta')).toBeInTheDocument();
  });

  test('shows an error message if deleting a game fails', async () => {
    const user = userEvent.setup();
    renderGamesPage({ deleteStatus: 500 });
    await screen.findByText('Marta');

    await user.click(screen.getByRole('button', { name: /delete daniel vs\. marta/i }));
    await user.click(screen.getByRole('button', { name: 'Delete game' }));

    expect(await screen.findByText(/could not delete/i)).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
  });

  // Phase 31 stat-bank import: a deferAnalysis-imported game with no
  // `analyses` row yet gets a "Not analyzed" status and a "Get coach
  // analysis" action that starts analysis without leaving the Games page.
  test('"Get coach analysis" on a not-analyzed game starts analysis and flips its status', async () => {
    const user = userEvent.setup();
    const fetchMock = renderGamesPage({ recent: [{ ...RECENT_GAME, analysisStatus: null }] });
    await screen.findByText('Marta');

    expect(screen.getByText('Not analyzed', { selector: 'span' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get coach analysis' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/analyze', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Analyzing…')).toBeInTheDocument();
  });

  // A card used to stay on "Analyzing…" forever once the initial fetch
  // landed. GET /api/analyses/active (the SSE stream the topbar engine
  // indicator watches) reports every in-progress analysis; the moment a
  // gameId drops out of it, the games queries refetch and pick up the real,
  // now-terminal status.
  test('a card updates itself once its background analysis finishes, via the active-analyses SSE stream', async () => {
    let currentRecent: unknown[] = [{ ...RECENT_GAME, analysisStatus: 'engine_running' }];
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games/imported?limit=15') return Promise.resolve(jsonResponse({ items: currentRecent, hasMore: false }));
      if (path === '/api/games/in-progress') return Promise.resolve(jsonResponse([]));
      if (path === '/api/users/me/llm-setup') return Promise.resolve(jsonResponse({ configured: true, unlocked: true, voiceAvailable: false }));
      return Promise.resolve(jsonResponse([]));
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

    act(() => {
      MockEventSource.instances[0]?.emit({
        engineMode: 'native',
        analyses: [{ analysisId: 'a1', gameId: 'g1', status: 'engine_running', analyzedPositions: 3, totalPositions: 10 }]
      });
    });
    expect(screen.getByText('Analyzing…')).toBeInTheDocument();

    currentRecent = [{ ...RECENT_GAME, analysisStatus: 'ready' }];
    act(() => {
      MockEventSource.instances[0]?.emit({ engineMode: 'native', analyses: [] });
    });

    expect(await screen.findByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.queryByText('Analyzing…')).not.toBeInTheDocument();
  });

  test('a failed-to-analyse game has no Review/Coach buttons, and can still be deleted', async () => {
    renderGamesPage({ recent: [{ ...RECENT_GAME, analysisStatus: 'failed' }] });
    await screen.findByText('Marta');

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(review|coach)$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete daniel vs\. marta/i })).toBeInTheDocument();
  });
});
