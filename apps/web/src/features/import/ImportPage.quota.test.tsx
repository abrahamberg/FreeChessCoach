import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DAILY_IMPORT_LIMIT, MAX_IN_FLIGHT_IMPORTS, type ImportQuotaResponse } from '@freechesscoach/shared';

vi.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="mock-chessboard" />
}));

const { ImportPage } = await import('./ImportPage.js');

const LICHESS_GAMES = [
  { id: 'g1', pgn: 'pgn-1', whiteName: 'daniel', blackName: 'Marta', result: '1-0', timeControl: '600+0', playedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'g2', pgn: 'pgn-2', whiteName: 'daniel', blackName: 'Bob', result: '0-1', timeControl: '600+0', playedAt: '2026-07-21T10:00:00.000Z' }
];

function quota(overrides: Partial<{ dailyUsed: number; inFlight: number }> = {}): ImportQuotaResponse {
  const { dailyUsed = 0, inFlight = 0 } = overrides;
  return {
    daily: { used: dailyUsed, limit: DAILY_IMPORT_LIMIT },
    weekly: { used: dailyUsed, limit: 150 },
    inFlight: { used: inFlight, limit: MAX_IN_FLIGHT_IMPORTS },
    library: { used: 10, limit: 1000, autoDeleteCount: 0 }
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function stubFetch(quotaBody: ImportQuotaResponse): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((path: string) => {
      if (path === '/api/games/import-quota') return Promise.resolve(json(quotaBody));
      if (path === '/api/lichess/recent-games') return Promise.resolve(json(LICHESS_GAMES));
      throw new Error(`unexpected fetch: ${path}`);
    })
  );
}

async function openLichessBulkPicker(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/import?tab=lichess']}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  await screen.findByRole('button', { name: /daniel.*marta/is });
  await user.click(screen.getByRole('checkbox', { name: /select several games to import/i }));
}

describe('ImportPage — the picker respects the import limits', () => {
  beforeEach(() => vi.stubGlobal('EventSource', class { close(): void {} }));
  afterEach(() => vi.unstubAllGlobals());

  test('with one import left today, only one game can be ticked and the other says why it is disabled', async () => {
    stubFetch(quota({ dailyUsed: DAILY_IMPORT_LIMIT - 1 }));
    const user = userEvent.setup();
    await openLichessBulkPicker(user);

    await user.click(await screen.findByRole('checkbox', { name: /select daniel vs\. marta to import/i }));

    const other = screen.getByRole('checkbox', { name: 'You can import 1 more game right now' });
    expect(other).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import 1 game' })).toBeEnabled();
  });

  test('with the daily limit used up, nothing can be ticked and the label names the daily limit', async () => {
    stubFetch(quota({ dailyUsed: DAILY_IMPORT_LIMIT }));
    const user = userEvent.setup();
    await openLichessBulkPicker(user);

    const boxes = await screen.findAllByRole('checkbox', { name: /daily import limit reached \(30 games\/day\)/i });
    expect(boxes).toHaveLength(LICHESS_GAMES.length);
    for (const box of boxes) expect(box).toBeDisabled();
  });

  test('with 10 games still analyzing, the label tells the reader to finish those first and keep the tab open', async () => {
    stubFetch(quota({ inFlight: MAX_IN_FLIGHT_IMPORTS }));
    const user = userEvent.setup();
    await openLichessBulkPicker(user);

    const boxes = await screen.findAllByRole('checkbox', { name: /finish analyzing your current games first — keep this tab open/i });
    for (const box of boxes) expect(box).toBeDisabled();
  });
});
