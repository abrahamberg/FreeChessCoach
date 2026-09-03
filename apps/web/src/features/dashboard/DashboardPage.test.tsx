import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DashboardPage } from './DashboardPage.js';

const DASHBOARD_RESPONSE = {
  focusAreas: {
    active: [
      {
        category: 'king_safety',
        diagnosisCode: 'MS-01',
        status: 'improving',
        note: 'Delays castling under pressure.',
        evidenceCount: 3,
        lastSeenAt: '2026-07-20T10:00:00.000Z'
      }
    ],
    resolved: [
      {
        category: 'passive_play',
        diagnosisCode: 'CA-01',
        status: 'resolved',
        note: 'Fixed it.',
        evidenceCount: 4,
        lastSeenAt: '2026-07-10T10:00:00.000Z'
      }
    ]
  },
  mistakeTrends: [{ category: 'king_safety', last5: 1, last20: 4 }],
  sessionHistory: [
    {
      sessionId: 's1',
      gameId: 'g1',
      startedAt: '2026-07-20T10:00:00.000Z',
      whiteName: 'daniel',
      blackName: 'Marta',
      userColor: 'white',
      result: '1-0',
      summary: 'Worked on king safety today.',
      homework: 'Solve 10 rook-endgame puzzles.'
    }
  ]
};

const DIAGNOSTICS_RESPONSE = {
  timeControl: '600+0',
  windowStart: '2026-06-01T00:00:00.000Z',
  windowEnd: '2026-07-20T00:00:00.000Z',
  computedAt: '2026-07-20T10:00:00.000Z',
  entries: [
    {
      code: 'DF-01',
      label: 'Actual-threat identification failure',
      direction: 'D',
      opportunities: 9,
      episodes: 6,
      failureRate: 6 / 9,
      confidence: 'probable',
      spread: { games: 5, sessions: 3, openings: 3, sides: 2 },
      severityMix: { minor: 0, meaningful: 2, major: 4, decisive: 0 },
      scopeTags: ['general'],
      controlSkill: null,
      historyStatus: 'persistent',
      firedGates: []
    }
  ]
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function renderDashboard() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/users/me/diagnostics')) return Promise.resolve(jsonResponse(DIAGNOSTICS_RESPONSE));
    return Promise.resolve(jsonResponse(DASHBOARD_RESPONSE));
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fetches the dashboard and renders focus areas, trends, and session history', async () => {
    const fetchMock = renderDashboard();

    await screen.findByRole('heading', { level: 3, name: /king safety/i });
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/dashboard', expect.anything());
    expect(screen.getByText(/worked on king safety today/i)).toBeInTheDocument();
  });

  test('the top active focus area appears as this week\'s focus', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 3, name: /king safety/i });
    expect(screen.getByText(/this week's focus/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /king safety/i })).toBeInTheDocument();
  });

  test('resolved focus areas start collapsed behind a "Resolved" accordion', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('heading', { level: 3, name: /king safety/i });

    expect(screen.queryByText(/passive play/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resolved/i }));
    expect(screen.getByText(/passive play/i)).toBeInTheDocument();
  });

  test('tapping a session history row navigates to the session', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(/worked on king safety today/i);

    await user.click(screen.getByText(/worked on king safety today/i));
    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
  });

  test('renders a "Measured diagnoses" section from the diagnostics endpoint, alongside focus areas', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: /measured diagnoses/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Actual-threat identification failure' })).toBeInTheDocument();
  });

  test('a focus area\'s "View evidence" opens the evidence modal for its diagnosisCode', async () => {
    const user = userEvent.setup();
    const fetchMock = renderDashboard();
    await screen.findByRole('heading', { level: 3, name: /king safety/i });

    await user.click(screen.getAllByRole('button', { name: /view evidence/i })[0]!);

    expect(await screen.findByRole('heading', { name: /evidence — king safety/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/diagnostics/MS-01/evidence', expect.anything());
  });

  test('a diagnosis card\'s "View evidence" opens the evidence modal for its own code', async () => {
    const user = userEvent.setup();
    const fetchMock = renderDashboard();
    await screen.findByRole('heading', { name: 'Actual-threat identification failure' });

    // Focus areas render first (DOM order), so the diagnosis card's own
    // "View evidence" is the second one on the page.
    const evidenceButtons = screen.getAllByRole('button', { name: /view evidence/i });
    await user.click(evidenceButtons[evidenceButtons.length - 1]!);

    expect(await screen.findByRole('heading', { name: /evidence — actual-threat identification failure/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/diagnostics/DF-01/evidence', expect.anything());
  });

  test('clicking a trend bar opens evidence for the highest-ranked diagnosis in that category', async () => {
    const user = userEvent.setup();
    const fetchMock = renderDashboard();
    await screen.findByRole('heading', { name: /measured diagnoses/i });

    await user.click(screen.getByRole('button', { name: /king safety: 4/i }));

    expect(await screen.findByRole('heading', { name: /evidence — actual-threat identification failure/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/diagnostics/DF-01/evidence', expect.anything());
  });
});
