import { useSyncExternalStore } from 'react';

/** When the api last refused this tab with 429, as the moment its limit
 * resets. One module-level value (not React state) so every request path —
 * the api client, the coach chat streams, TTS — can report into it and the
 * one RateLimitNotice at the app root shows it. */
let limitedUntil: number | null = null;
const listeners = new Set<() => void>();

const FALLBACK_RETRY_SECONDS = 60;

/** Call with any failed response; only a 429 is recorded. */
export function noteRateLimit(response: Response): void {
  if (response.status !== 429) return;
  const seconds = Number(response.headers.get('retry-after'));
  const retryAfter = Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_RETRY_SECONDS;
  limitedUntil = Math.max(limitedUntil ?? 0, Date.now() + retryAfter * 1000);
  for (const listener of listeners) listener();
}

export function clearRateLimitNotice(): void {
  limitedUntil = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRateLimitedUntil(): number | null {
  return useSyncExternalStore(subscribe, () => limitedUntil, () => null);
}
