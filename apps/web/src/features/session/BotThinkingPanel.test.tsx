import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { BotThinkingPanel } from './BotThinkingPanel.js';

const MOVE = {
  ply: 2,
  source: 'turn',
  status: 'done',
  startedAt: 1000,
  endedAt: 2400,
  path: 'top moves — best move',
  picked: 'e5',
  engineMode: 'internal',
  steps: [{ id: 1, label: 'Opening book lookup', detail: 'not in the book', startedAt: 1000, endedAt: 1010, status: 'done' }]
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderPanel(isBotTurn = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BotThinkingPanel sessionId="s1" isBotTurn={isBotTurn} />
    </QueryClientProvider>
  );
}

describe('BotThinkingPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('shows the Thinking log heading and the moves read from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ moves: [MOVE] })));

    renderPanel();

    expect(screen.getByText('Thinking log')).toBeInTheDocument();
    expect(await screen.findByText('Opening book lookup')).toBeInTheDocument();
    expect(screen.getByText(/played e5/)).toBeInTheDocument();
  });

  test('"Copy log" puts the whole log on the clipboard as text and says so', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ moves: [MOVE] })));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    renderPanel();
    await screen.findByText('Opening book lookup');
    fireEvent.click(screen.getByRole('button', { name: 'Copy log' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Move 1 · Black (ply 2) — done in 1.40s — played e5'));
  });

  test('says when copying is not possible instead of failing silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ moves: [MOVE] })));
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    renderPanel();
    await screen.findByText('Opening book lookup');
    fireEvent.click(screen.getByRole('button', { name: 'Copy log' }));

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });

  test('shows a live "thinking" marker in the heading while the bot is working', async () => {
    const thinking = { ...MOVE, status: 'thinking', endedAt: null, path: null, picked: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ moves: [thinking] })));

    renderPanel(true);

    expect(await screen.findByText(/thinking for/i)).toBeInTheDocument();
  });
});
