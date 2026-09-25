import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createFixedWindowCounter, type RateLimit } from '../lib/fixed-window-counter.js';
import { rateLimitKey, refuseRateLimited } from './route-rate-limit.js';

/** A floor under every /api route, per signed-in user, on top of the tighter
 * per-route caps. The busiest real client is a bot game: the thinking log
 * polls every 500ms (120/min) plus moves, voice sentences and page loads,
 * roughly 200/min. A WebSocket or SSE stream counts once, however long it
 * runs, and background analysis goes through /internal, so neither counts.
 * Per pod, in memory: the real ceiling is this times the replica count. */
export const API_RATE_LIMIT: RateLimit = { max: 600, windowMs: 60_000 };

export const apiRateLimitPlugin = fp((app: FastifyInstance, opts: { limit?: RateLimit }) => {
  const limit = opts.limit ?? API_RATE_LIMIT;
  const counter = createFixedWindowCounter(limit);
  // Registered after the auth plugin, so request.user is already set here.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const retryAfterSeconds = counter.hit(rateLimitKey(request));
    if (retryAfterSeconds !== null) refuseRateLimited(request, reply, retryAfterSeconds, limit);
  });
  return Promise.resolve();
});
