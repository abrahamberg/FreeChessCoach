export interface RateLimit {
  max: number;
  windowMs: number;
}

const MAX_TRACKED_KEYS = 10_000;

/** Per-key fixed-window request counter, in memory. `hit` records one request
 * and returns the seconds until the window resets when that request is over
 * the limit, or null when it is allowed. */
export function createFixedWindowCounter(limit: RateLimit): { hit(key: string, now?: number): number | null } {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        if (windows.size >= MAX_TRACKED_KEYS) pruneExpired(windows, now);
        windows.set(key, { count: 1, resetAt: now + limit.windowMs });
        return null;
      }
      current.count += 1;
      return current.count > limit.max ? Math.ceil((current.resetAt - now) / 1000) : null;
    }
  };
}

function pruneExpired(windows: Map<string, { resetAt: number }>, now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows: drop the oldest rather than grow unbounded.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = windows.keys().next();
    if (!oldest.done) windows.delete(oldest.value);
  }
}
