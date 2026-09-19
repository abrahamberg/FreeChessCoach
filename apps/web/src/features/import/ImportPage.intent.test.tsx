import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AUTO_DELETE_BATCH, MAX_LIBRARY_GAMES, type ImportQuotaResponse } from '@freechesscoach/shared';

vi.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="mock-chessboard" />
}));

const { ImportPage } = await import('./ImportPage.js');

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  close(): void {}
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function json(body: unknown, status = 200, type = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
}

function quota(libraryUsed = 10): ImportQuotaResponse {
  return {
    daily: { used: 0, limit: 30 },
    weekly: { used: 0, limit: 150 },
    inFlight: { used: 0, limit: 10 },
    library: { used: libraryUsed, limit: MAX_LIBRARY_GAMES, autoDeleteCount: libraryUsed >= MAX_LIBRARY_GAMES ? AUTO_DELETE_BATCH : 0 }
  };
}

interface Setup {
  llmConfigured?: boolean;
  libraryUsed?: number;
  /** Answer the first POST /api/games with the 422 "which colour" problem. */
  askColorFirst?: boolean;
}

function stubApi({ llmConfigured = true, libraryUsed = 10, askColorFirst = false }: Setup = {}) {
  let importCalls = 0;
  const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/games/import-quota') return Promise.resolve(json(quota(libraryUsed)));
    if (path === '/api/users/me/llm-setup') return Promise.resolve(json({ configured: llmConfigured, unlocked: llmConfigured, voiceAvailable: false }));
    if (path === '/api/games' && init?.method === 'POST') {
      importCalls += 1;
      if (askColorFirst && importCalls === 1) return Promise.resolve(json({ type: 'about:blank', title: 'x', status: 422, missing: 'userColor' }, 422, 'application/problem+json'));
      return Promise.resolve(json({ gameId: 'game-1', analysisId: 'analysis-1' }));
    }
    if (path === '/api/games/game-1') return Promise.resolve(json({ id: 'game-1', source: 'paste', reviewTier: 'imported' }));
    if (path === '/api/games/game-1/promote') return Promise.resolve(json({ reviewTier: 'coach' }));
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
      <MemoryRouter initialEntries={['/import']}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
          <Route path="/review/:id" element={<div>review-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function typePgn(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByRole('textbox', { name: /pgn/i }), '1. e4 e5');
}

/** The notice decides from the loaded quota, so wait for that response to
 * land (request made, then a beat for the query to store it) before acting. */
async function quotaLoaded(fetchMock: ReturnType<typeof vi.fn>): Promise<void> {
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games/import-quota', expect.anything()));
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const postedGames = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([path, init]) => path === '/api/games' && (init as RequestInit | undefined)?.method === 'POST');

describe('ImportPage — Analyze or Get coaching session', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  test('Analyze goes to the review when analysis is ready — and never starts a session', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderImportPage();
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    MockEventSource.instances[0]?.emit({ status: 'ready' });

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  test('nothing navigates before the analysis is ready, whichever button was pressed', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderImportPage();
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Get coaching session' }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    MockEventSource.instances[0]?.emit({ status: 'engine_running' });

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('session-page-marker')).not.toBeInTheDocument();
    expect(screen.queryByText('review-page-marker')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  test('Get coaching session promotes the game, starts a session and opens it once ready', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderImportPage();
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Get coaching session' }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    MockEventSource.instances[0]?.emit({ status: 'ready' });

    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/games/game-1/promote', expect.objectContaining({ method: 'POST' }));
  });

  test('with no AI set up, Get coaching session shows the AI-setup prompt instead of a session, and "Analyze without AI" opens the review', async () => {
    const fetchMock = stubApi({ llmConfigured: false });
    const user = userEvent.setup();
    renderImportPage();
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Get coaching session' }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    MockEventSource.instances[0]?.emit({ status: 'ready' });

    expect(await screen.findByText('AI setup needed')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());

    await user.click(screen.getByRole('button', { name: /analyze without ai/i }));
    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
  });

  test('the "which colour were you?" round trip keeps the chosen intent', async () => {
    const fetchMock = stubApi({ askColorFirst: true });
    const user = userEvent.setup();
    renderImportPage();
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await user.click(await screen.findByRole('button', { name: /i played white/i }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    MockEventSource.instances[0]?.emit({ status: 'ready' });

    expect(await screen.findByText('review-page-marker')).toBeInTheDocument();
    const bodies = postedGames(fetchMock).map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
    expect(bodies).toEqual([
      { pgn: '1. e4 e5', source: 'paste' },
      { pgn: '1. e4 e5', source: 'paste', userColor: 'white' }
    ]);
  });
});

describe('ImportPage — the auto-delete notice', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  test('with a full library, a single import waits for confirmation and says what will be deleted', async () => {
    const fetchMock = stubApi({ libraryUsed: MAX_LIBRARY_GAMES });
    const user = userEvent.setup();
    renderImportPage();
    await quotaLoaded(fetchMock);
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(
      await screen.findByText(`You have ${MAX_LIBRARY_GAMES} of ${MAX_LIBRARY_GAMES} games. Importing will delete your ${AUTO_DELETE_BATCH} earliest games. Their stats are kept.`)
    ).toBeInTheDocument();
    expect(postedGames(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Import and delete' }));
    await waitFor(() => expect(postedGames(fetchMock)).toHaveLength(1));
  });

  test('cancelling the notice imports nothing', async () => {
    const fetchMock = stubApi({ libraryUsed: MAX_LIBRARY_GAMES });
    const user = userEvent.setup();
    renderImportPage();
    await quotaLoaded(fetchMock);
    await typePgn(user);
    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Import and delete' })).not.toBeInTheDocument();
    expect(postedGames(fetchMock)).toHaveLength(0);
  });

  test('with room in the library there is no notice and the import starts at once', async () => {
    const fetchMock = stubApi({ libraryUsed: 10 });
    const user = userEvent.setup();
    renderImportPage();
    await quotaLoaded(fetchMock);
    await typePgn(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => expect(postedGames(fetchMock)).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Import and delete' })).not.toBeInTheDocument();
  });
});
