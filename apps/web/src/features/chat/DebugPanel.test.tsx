import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DebugPanel } from './DebugPanel.js';

const snapshot = (said: string, answer: string) => ({
  request: { provider: 'local', model: 'gemma', instructions: [], messages: [{ role: 'user', content: said }], tools: [], maxSteps: 4, reasoning: 'provider-default', providerOptions: null },
  response: { messages: [{ role: 'assistant', content: answer }], finishReason: 'stop', usage: { freshInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: null, outputTokens: 1, reasoningTokens: 0 } }
});

function mockFetch(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      const body = routes[path];
      return Promise.resolve(new Response(JSON.stringify(body ?? { error: 'Not found' }), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } }));
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('DebugPanel', () => {
  test('opens on the newest turn and steps back through the picker', async () => {
    mockFetch({
      '/api/sessions/s1/debug/turns': {
        turns: [
          { at: '2026-09-28T10:00:00.000Z', snapshot: snapshot('Why Bc4?', 'It eyes f7.') },
          { at: '2026-09-28T10:01:00.000Z', snapshot: snapshot('And Nf3?', 'It develops.') }
        ]
      }
    });
    render(<DebugPanel sessionId="s1" onClose={() => undefined} />);

    expect(await screen.findByText(/turn 2 of 2/)).toBeTruthy();
    expect(screen.getAllByText('It develops.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: /Why Bc4\?/ }));
    expect(screen.getAllByText('It eyes f7.').length).toBeGreaterThan(0);
    expect(screen.getByText(/turn 1 of 2/)).toBeTruthy();
  });

  test('a session from before the turn log shows its latest turn, with no picker', async () => {
    mockFetch({ '/api/puzzle-sessions/p1/debug/turns': { turns: [] }, '/api/puzzle-sessions/p1/debug/last-turn': snapshot('Hint?', 'Look at f7.') });
    render(<DebugPanel sessionId="p1" basePath="/api/puzzle-sessions" onClose={() => undefined} />);

    expect((await screen.findAllByText('Look at f7.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
