import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearRateLimitNotice, noteRateLimit } from './rate-limit-notice.js';

// Reads the module value through a subscriber, the way the hook does.
async function currentUntil(): Promise<number | null> {
  const module = await import('./rate-limit-notice.js');
  let value: number | null = null;
  const { renderHook } = await import('@testing-library/react');
  const { result } = renderHook(() => module.useRateLimitedUntil());
  value = result.current;
  return value;
}

describe('rate-limit notice store', () => {
  afterEach(() => {
    clearRateLimitNotice();
    vi.useRealTimers();
  });

  test('a 429 records when the limit resets, from Retry-After', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    noteRateLimit(new Response(null, { status: 429, headers: { 'retry-after': '16' } }));
    expect(await currentUntil()).toBe(1_000_000 + 16_000);
  });

  test('other failures are ignored', async () => {
    noteRateLimit(new Response(null, { status: 500 }));
    noteRateLimit(new Response(null, { status: 400 }));
    expect(await currentUntil()).toBeNull();
  });

  test('a 429 without Retry-After still shows, for a minute', async () => {
    vi.useFakeTimers({ now: 5_000 });
    noteRateLimit(new Response(null, { status: 429 }));
    expect(await currentUntil()).toBe(5_000 + 60_000);
  });
});
