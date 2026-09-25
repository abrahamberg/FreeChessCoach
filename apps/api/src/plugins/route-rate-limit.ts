import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { RateLimitError } from '../lib/errors.js';

export interface RouteRateLimit {
  max: number;
  windowMs: number;
}

/** Per-user caps on routes that spend something shared: outbound calls to a
 * user-chosen endpoint, the Stockfish pool, scrypt CPU, or a third-party API
 * that could rate-limit or ban this server's IP. Generous enough that a
 * person clicking through positions never meets them; they exist to stop a
 * script. Counted per pod (in memory), so the real ceiling is this times the
 * replica count — abuse control, not a billing meter. */
export const ROUTE_RATE_LIMITS = {
  llmSetupProbe: { max: 10, windowMs: 60_000 },
  llmSetupUnlock: { max: 10, windowMs: 5 * 60_000 },
  engineInteractive: { max: 120, windowMs: 60_000 },
  enginePing: { max: 10, windowMs: 60_000 },
  remoteGameList: { max: 30, windowMs: 60_000 }
} as const satisfies Record<string, RouteRateLimit>;

const MAX_TRACKED_KEYS = 10_000;

/** Route options adding a fixed-window limit keyed by the authenticated user.
 * A plain preHandler rather than @fastify/rate-limit: that plugin attaches
 * through an onRoute hook, which buildApp's synchronously registered routes
 * are added before, so its limits silently never applied. */
export function rateLimitConfig(limit: RouteRateLimit): { preHandler: preHandlerAsyncHookHandler } {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    preHandler: async (request: FastifyRequest) => {
      const now = Date.now();
      const key = request.user?.email ?? request.ip;
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        if (windows.size >= MAX_TRACKED_KEYS) pruneExpired(windows, now);
        windows.set(key, { count: 1, resetAt: now + limit.windowMs });
        return;
      }
      current.count += 1;
      if (current.count > limit.max) {
        throw new RateLimitError(`Too many requests; try again in ${Math.ceil((current.resetAt - now) / 1000)} seconds`);
      }
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
