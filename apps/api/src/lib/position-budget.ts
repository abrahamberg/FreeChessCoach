import type { RateLimit } from './fixed-window-counter.js';

const MAX_TRACKED_KEYS = 10_000;

interface Window {
  spent: number;
  resetAt: number;
}

/** A per-key allowance of units (engine positions) per fixed window, in
 * memory. `refusal` says how many seconds until `units` more fit (null when
 * they fit now) without spending them; `spend` records them. */
export interface PositionBudget {
  refusal(key: string, units: number, now?: number): number | null;
  spend(key: string, units: number, now?: number): void;
}

export function createPositionBudget(limit: RateLimit): PositionBudget {
  const windows = new Map<string, Window>();
  const current = (key: string, now: number): Window | undefined => {
    const window = windows.get(key);
    return window && window.resetAt > now ? window : undefined;
  };
  return {
    refusal(key, units, now = Date.now()) {
      const window = current(key, now);
      if (units > limit.max) return Math.ceil(limit.windowMs / 1000);
      if (!window || window.spent + units <= limit.max) return null;
      return Math.ceil((window.resetAt - now) / 1000);
    },
    spend(key, units, now = Date.now()) {
      const window = current(key, now);
      if (window) {
        window.spent += units;
        return;
      }
      if (windows.size >= MAX_TRACKED_KEYS) pruneExpired(windows, now);
      windows.set(key, { spent: units, resetAt: now + limit.windowMs });
    }
  };
}

function pruneExpired(windows: Map<string, Window>, now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = windows.keys().next();
    if (!oldest.done) windows.delete(oldest.value);
  }
}
