import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FindGamesPage } from './FindGamesPage.js';

class MockEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  close(): void {}
}

/** Lets a test trigger "the user scrolled to the bottom" by hand, since
 * jsdom has no layout and so no real intersection. */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {
    MockIntersectionObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
  trigger(): void {
    this.callback([{ isIntersecting: true }]);
  }
}

function makeGame(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `g${index}`,
    source: 'lichess',
    userColor: 'white',
    whiteName: `white${index}`,
    blackName: `black${index}`,
    result: '1-0',
    timeControl: '10+0',
    playedAt: '2026-07-20T10:00:00.000Z',
    createdAt: '2026-07-20T10:05:00.000Z',
    analysisStatus: 'ready',
    sessionId: null,
    botId: null,
    reviewTier: 'imported',
    estimatedRating: 1400,
    ...overrides
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** 45 games served 20/20/5 by offset, exactly like the real endpoint. */
const ALL_GAMES = Array.from({ length: 45 }, (_, index) => makeGame(index + 1));

function renderFindPage({ llmConfigured = true, games = ALL_GAMES }: { llmConfigured?: boolean; games?: unknown[] } = {}) {
  const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith('/api/games/imported?')) {
      const params = new URL(path, 'http://localhost').searchParams;
      const offset = Number(params.get('offset'));
      const limit = Number(params.get('limit'));
      return Promise.resolve(jsonResponse({ items: games.slice(offset, offset + limit), hasMore: offset + limit < games.length }));
    }
    if (path === '/api/games/imported/delete-earliest') return Promise.resolve(jsonResponse({ deleted: 50 }));
    if (path === '/api/users/me/llm-setup') {
      return Promise.resolve(jsonResponse({ configured: llmConfigured, unlocked: llmConfigured, voiceAvailable: false }));
    }
    if (path.endsWith('/pgn')) return Promise.resolve(new Response('1. e4 e5 *', { status: 200 }));
    if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(jsonResponse({ id: 'session-1' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/games/find']}>
        <Routes>
          <Route path="/games" element={<div>games-page-marker</div>} />
          <Route path="/games/find" element={<FindGamesPage />} />
          <Route path="/review/:gameId" element={<div>review-page-marker</div>} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

function importedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => call[0] as string).filter((url) => url.startsWith('/api/games/imported?'));
}

async function scrollToBottom(): Promise<void> {
  await act(async () => {
    MockIntersectionObserver.instances.at(-1)?.trigger();
  });
}

describe('FindGamesPage', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('shows the first 20 games, then loads 20 more each time the bottom is reached', async () => {
    const fetchMock = renderFindPage();

    expect(await screen.findByText('white1')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(importedUrls(fetchMock)).toHaveLength(1);
    expect(importedUrls(fetchMock)[0]).toContain('limit=20');
    expect(importedUrls(fetchMock)[0]).toContain('offset=0');

    await scrollToBottom();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(40));
    expect(importedUrls(fetchMock)[1]).toContain('offset=20');

    await scrollToBottom();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(45));
    expect(importedUrls(fetchMock)[2]).toContain('offset=40');
  });

  test('shows a loader while the next page is loading', async () => {
    let releasePage: (response: Response) => void = () => {};
    const fetchMock = renderFindPage();
    await screen.findByText('white1');
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes('offset=20')) return new Promise<Response>((resolve) => (releasePage = resolve));
      return original(path, init);
    });

    await scrollToBottom();

    expect(await screen.findByText(/loading more games/i)).toBeInTheDocument();
    await act(async () => {
      releasePage(jsonResponse({ items: ALL_GAMES.slice(20, 40), hasMore: true }));
    });
    await waitFor(() => expect(screen.queryByText(/loading more games/i)).not.toBeInTheDocument());
  });

  test('stops asking for pages once the list has ended', async () => {
    const fetchMock = renderFindPage({ games: ALL_GAMES.slice(0, 5) });
    await screen.findByText('white1');

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(importedUrls(fetchMock)).toHaveLength(1);
    // No observer is set up when there is no next page.
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  test('the time filter refetches from the first page with that range', async () => {
    const user = userEvent.setup();
    const fetchMock = renderFindPage();
    await screen.findByText('white1');

    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));

    await waitFor(() => expect(importedUrls(fetchMock).at(-1)).toContain('range=last7'));
    expect(importedUrls(fetchMock).at(-1)).toContain('offset=0');
  });

  test('the estimated-rating filter sends that band\'s bounds', async () => {
    const user = userEvent.setup();
    const fetchMock = renderFindPage();
    await screen.findByText('white1');

    await user.selectOptions(screen.getByLabelText('Estimated rating'), '1200 – 1599');

    await waitFor(() => expect(importedUrls(fetchMock).at(-1)).toContain('minRating=1200'));
    expect(importedUrls(fetchMock).at(-1)).toContain('maxRating=1599');
  });

  test('shows an empty state when no game matches the filters', async () => {
    renderFindPage({ games: [] });
    expect(await screen.findByText(/no imported games match/i)).toBeInTheDocument();
  });

  test('"Delete earliest 50" asks for confirmation first, and only then deletes', async () => {
    const user = userEvent.setup();
    const fetchMock = renderFindPage();
    await screen.findByText('white1');

    await user.click(screen.getByRole('button', { name: 'Delete earliest 50' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/50 games you imported first/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/imported/delete-earliest', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Delete 50 games' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/imported/delete-earliest',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ count: 50 }) })
      )
    );
    expect(await screen.findByText('Deleted 50 games.')).toBeInTheDocument();
  });

  test('canceling "Delete earliest 50" deletes nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = renderFindPage();
    await screen.findByText('white1');

    await user.click(screen.getByRole('button', { name: 'Delete earliest 50' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/games/imported/delete-earliest', expect.anything());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('every row has Review, Coach and a confirmed Delete', async () => {
    const user = userEvent.setup();
    const fetchMock = renderFindPage({ games: [makeGame(1)] });
    await screen.findByText('white1');

    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coach' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete white1 vs\. black1/i }));
    await user.click(screen.getByRole('button', { name: 'Delete game' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1', expect.objectContaining({ method: 'DELETE' }));
  });

  test('"Coach" without an AI key shows the setup popup instead of starting a session', async () => {
    const user = userEvent.setup();
    const fetchMock = renderFindPage({ games: [makeGame(1)], llmConfigured: false });
    await screen.findByText('white1');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/me/llm-setup', expect.anything()));

    await user.click(screen.getByRole('button', { name: 'Coach' }));

    expect(await screen.findByRole('dialog', { name: /ai setup needed/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sessions', expect.anything());
  });

  test('"Copy PGN" in the overflow menu writes the game\'s PGN to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderFindPage({ games: [makeGame(1)] });
    await screen.findByText('white1');

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy PGN' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('1. e4 e5 *'));
  });

  test('the back link returns to Games', async () => {
    const user = userEvent.setup();
    renderFindPage({ games: [makeGame(1)] });
    await screen.findByText('white1');

    await user.click(screen.getByRole('link', { name: /games/i }));

    expect(await screen.findByText('games-page-marker')).toBeInTheDocument();
  });
});
