import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { BotStatusPanel } from './BotStatusPanel.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface RenderOptions {
  sessionId?: string;
  thinkingLogEnabled?: boolean;
}

/** The panel only needs a subset of its props to exercise the Thinking log's
 * gating: no clock, no game over, no resign. */
function renderPanel({ sessionId = 's1', thinkingLogEnabled }: RenderOptions = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BotStatusPanel
        botName="Nate"
        isPlayerTurn
        gameOver={null}
        userColor="white"
        sessionId={sessionId}
        thinkingLogEnabled={thinkingLogEnabled}
      />
    </QueryClientProvider>
  );
}

/** The Thinking log is opt-in per session (0043_bot_thinking_log.ts, its ⋯
 * menu item) — the default is hidden AND unpolled, so a disabled session
 * must not even start the log's own GET. */
describe('BotStatusPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('renders no Thinking log section by default and does not poll it', () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ moves: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    expect(screen.queryByText('Thinking log')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('renders the Thinking log section when the session has it enabled', async () => {
    const move = {
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ moves: [move] })));

    renderPanel({ thinkingLogEnabled: true });

    expect(screen.getByText('Thinking log')).toBeInTheDocument();
    expect(await screen.findByText('Opening book lookup')).toBeInTheDocument();
  });
});
