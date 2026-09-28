import type { CourseDebugCall } from '@freechesscoach/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CourseDebugPanel } from './CourseDebugPanel.js';

const snapshot = (user: string, answer: string) => ({
  request: {
    provider: 'openai', model: 'gpt-6-luna', instructions: [{ role: 'system', content: 'You write chess lessons.' }],
    messages: [{ role: 'user', content: user }], tools: [], maxSteps: 1, reasoning: 'medium', providerOptions: null
  },
  response: {
    messages: [{ role: 'assistant', content: answer }], finishReason: 'stop',
    usage: { freshInputTokens: 8000, cacheReadTokens: 0, cacheWriteTokens: null, outputTokens: 600, reasoningTokens: 0 }, providerMetadata: null
  }
});

const call = (patch: Partial<CourseDebugCall>): CourseDebugCall => ({
  at: '2026-09-28T10:00:00.000Z', step: 'episode', episodeId: 'e3', repair: false, durationMs: 9400, error: null, problems: [],
  snapshot: snapshot('Write episode e3.', '{"episodeId":"e3"}'), ...patch
});

const CALLS: CourseDebugCall[] = [
  call({ step: 'outline', episodeId: null, problems: ['there is no safety episode'], snapshot: snapshot('Plan the course.', '{"title":"Englund"}') }),
  call({ step: 'outline', episodeId: null, repair: true }),
  call({})
];

function renderPanel() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ calls: CALLS }), { headers: { 'content-type': 'application/json' } })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CourseDebugPanel courseId="c1" generating={false} onClose={() => undefined} />
    </QueryClientProvider>
  );
}

describe('CourseDebugPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  test("opens on the newest call in the chat's debug panel, with the call list and the checks", async () => {
    renderPanel();

    expect(await screen.findByText('Course AI call — episode e3')).toBeTruthy();
    expect(screen.getByText('call 3 of 3 · 9.4s')).toBeTruthy();
    expect(screen.getByText('Our checks passed this answer.')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['1. outline ✗1', '2. outline, repair ✓', '3. episode e3 ✓']);
  });

  test('picking a call shows its prompts and what the checks found', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('tab', { name: '1. outline ✗1' }));

    expect(screen.getByText('Course AI call — outline')).toBeTruthy();
    expect(screen.getByText('there is no safety episode')).toBeTruthy();
    expect(screen.getAllByText('Plan the course.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('{"title":"Englund"}').length).toBeGreaterThan(0);
  });
});
