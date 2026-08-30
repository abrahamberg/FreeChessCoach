import { TACTIC_MOTIF_TYPES } from '@freechesscoach/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { StatsPage } from './StatsPage.js';

function zeroTacticMotifs() {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
}

function buildDashboard(gamesAnalyzed: number) {
  return {
    gamesAnalyzed,
    opening: { averageBookMoves: 6.5, openingAccuracy: 88, averageOpeningMistakes: 0.5, performanceByOpening: [] },
    tactics: zeroTacticMotifs(),
    strategy: { overall: 78, pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { overallAccuracy: 70, byStanding: [], byTheme: [] }
  };
}

function renderStatsPage(dashboard: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(dashboard), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/stats']}>
        <Routes>
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

describe('StatsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fetches the dashboard with the default range=all&speed=rapid and renders every section', async () => {
    const fetchMock = renderStatsPage(buildDashboard(12));

    await screen.findByRole('heading', { level: 2, name: /opening/i });
    expect(screen.getByRole('heading', { level: 2, name: /tactics/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /strategy/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /endgame/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/stats?range=all&speed=rapid', expect.anything());
  });

  test('shows an empty state when zero games are analyzed', async () => {
    renderStatsPage(buildDashboard(0));
    expect(await screen.findByText(/analyze some games to see your stats/i)).toBeInTheDocument();
  });

  test('clicking a range tab re-fetches with the new range', async () => {
    const user = userEvent.setup();
    const fetchMock = renderStatsPage(buildDashboard(3));
    await screen.findByRole('heading', { level: 2, name: /opening/i });

    await user.click(screen.getByRole('button', { name: /last 7 days/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/users/me/stats?range=last7&speed=rapid', expect.anything())
    );
  });

  test('clicking the "All formats" toggle re-fetches with speed=all', async () => {
    const user = userEvent.setup();
    const fetchMock = renderStatsPage(buildDashboard(3));
    await screen.findByRole('heading', { level: 2, name: /opening/i });

    await user.click(screen.getByRole('button', { name: /all formats/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/users/me/stats?range=all&speed=all', expect.anything())
    );
  });
});
