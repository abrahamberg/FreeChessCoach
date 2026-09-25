import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { RateLimitError } from '../lib/errors.js';
import { createFixedWindowCounter, type RateLimit } from '../lib/fixed-window-counter.js';

export type RouteRateLimit = RateLimit;

/** Per-user caps on routes that spend something shared: outbound calls to a
 * user-chosen endpoint, the Stockfish pool, scrypt CPU, or a third-party API
 * that could rate-limit or ban this server's IP. Set at "clearly a script"
 * levels, not "busy human": the UI legitimately bursts (arrowing through a
 * game's positions, paging a long game list, a settings form refetching as
 * it's edited). Counted per pod (in memory), so the real ceiling is this
 * times the replica count — abuse control, not a billing meter. Every refusal
 * is logged with its route, so a cap real use hits shows up in the logs. */
export const ROUTE_RATE_LIMITS = {
  // Each call makes ~6 outbound requests to the user's endpoint.
  llmSetupProbe: { max: 15, windowMs: 60_000 },
  // Debounced 500ms and cached 10s in the form: ~6/min while typing.
  llmLocalModels: { max: 60, windowMs: 60_000 },
  llmSetupUnlock: { max: 10, windowMs: 5 * 60_000 },
  // Arrowing through a game's positions; results are cached per FEN.
  engineInteractive: { max: 240, windowMs: 60_000 },
  enginePing: { max: 15, windowMs: 60_000 },
  // One request per page of a player's game history.
  remoteGameList: { max: 60, windowMs: 60_000 }
} as const satisfies Record<string, RouteRateLimit>;

/** Route options adding a fixed-window limit keyed by the authenticated user.
 * A plain preHandler rather than @fastify/rate-limit: that plugin attaches
 * through an onRoute hook, which buildApp's synchronously registered routes
 * are added before, so its limits silently never applied. */
export function rateLimitConfig(limit: RouteRateLimit): { preHandler: preHandlerAsyncHookHandler } {
  const counter = createFixedWindowCounter(limit);
  return {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const retryAfterSeconds = counter.hit(rateLimitKey(request));
      if (retryAfterSeconds !== null) refuseRateLimited(request, reply, retryAfterSeconds, limit);
    }
  };
}

export function rateLimitKey(request: FastifyRequest): string {
  return request.user?.email ?? request.ip;
}

/** Logs the refusal (so a cap real use reaches shows up) and answers 429
 * with Retry-After, which the web client turns into a visible notice. */
export function refuseRateLimited(request: FastifyRequest, reply: FastifyReply, retryAfterSeconds: number, limit: RateLimit): never {
  request.log.warn({ route: request.routeOptions.url ?? request.url, limit: limit.max, windowMs: limit.windowMs }, 'rate limited');
  void reply.header('retry-after', String(retryAfterSeconds));
  throw new RateLimitError(`Too many requests; try again in ${retryAfterSeconds} seconds`);
}
