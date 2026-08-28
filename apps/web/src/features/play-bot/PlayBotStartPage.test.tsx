import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PlayBotStartPage } from './PlayBotStartPage.js';

function renderPlayBotStartPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/play-bot/new']}>
        <Routes>
          <Route path="/play-bot/new" element={<PlayBotStartPage />} />
          <Route path="/bot-session/:id" element={<div>session-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PlayBotStartPage ("Play vs Bot" plan)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('renders a card per roster bot, with no color picker until one is chosen', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPlayBotStartPage();

    expect(screen.getByText('Nate Brooks')).toBeInTheDocument();
    expect(screen.getByText('Tony Varga')).toBeInTheDocument();
    expect(screen.getByText('Yuna Seo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play as white/i })).not.toBeInTheDocument();
  });

  test('picking a bot then a color POSTs /api/sessions/play-bot with both, and navigates to the fresh session', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/sessions/play-bot') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'session-9' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPlayBotStartPage();

    await user.click(screen.getByText('Tony Varga'));
    await user.click(screen.getByRole('button', { name: /play as black/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sessions/play-bot',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ studentColor: 'black', botId: 'tony-varga', clock: null })
        })
      )
    );
    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
  });

  test('picking a time control includes it in the request', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/sessions/play-bot') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'session-9' }), { status: 200, headers: { 'content-type': 'application/json' } })
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPlayBotStartPage();

    await user.click(screen.getByText('Tony Varga'));
    await user.click(screen.getByRole('radio', { name: '5 min' }));
    await user.click(screen.getByRole('button', { name: /play as white/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sessions/play-bot',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ studentColor: 'white', botId: 'tony-varga', clock: { initialMs: 300000, incrementMs: 0 } })
        })
      )
    );
  });

  test('a failed start shows an inline error instead of navigating', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPlayBotStartPage();

    await user.click(screen.getByText('Nate Brooks'));
    await user.click(screen.getByRole('button', { name: /play as white/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('session-page-marker')).not.toBeInTheDocument();
  });
});
