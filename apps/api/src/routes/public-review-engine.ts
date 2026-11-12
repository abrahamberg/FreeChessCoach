import { PublicReviewEngineRequestSchema, type PublicReviewEngineResponse } from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ValidationError } from '../lib/errors.js';
import { createFixedWindowCounter, type RateLimit } from '../lib/fixed-window-counter.js';
import { refuseRateLimited } from '../plugins/route-rate-limit.js';
import { PublicEngineRefusedError, type PublicReviewEngine } from '../services/engine/public-review-engine.js';

/** Requests per visitor: a review sends one per six positions, so a long
 * game is about twenty, and Explore one per position looked at. */
const REQUESTS_PER_VISITOR: RateLimit = { max: 120, windowMs: 60_000 };

/**
 * POST /api/public/review-engine: the free review's server engine for a
 * visitor with no account (docs/threat-model.md T15). Skip-auth at the proxy
 * through the existing `^/api/public/` entry and exempt in auth-headers.ts
 * by the matched route; it never reads `request.user`. The positions are
 * searched and answered, never stored or logged.
 */
export function registerPublicReviewEngineRoutes(app: FastifyInstance, engine: PublicReviewEngine): void {
  const requests = createFixedWindowCounter(REQUESTS_PER_VISITOR);
  app.post('/api/public/review-engine', async (request, reply): Promise<PublicReviewEngineResponse> => {
    const visitor = visitorKey(request);
    const retryAfter = requests.hit(visitor);
    if (retryAfter !== null) refuseRateLimited(request, reply, retryAfter, REQUESTS_PER_VISITOR);
    const parsed = PublicReviewEngineRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Send up to 12 positions and 3 or 5 lines.');
    try {
      return await engine.analyze(visitor, parsed.data.fens, parsed.data.multiPv);
    } catch (error) {
      if (error instanceof PublicEngineRefusedError) {
        request.log.warn({ route: '/api/public/review-engine', reason: error.reason }, 'public engine refused');
        void reply.header('retry-after', String(error.retryAfterSeconds));
      }
      throw error;
    }
  });
}

/**
 * Who is asking. Every anonymous request reaches the api from the proxy's
 * address, so the visitor is told apart by Cloudflare's `CF-Connecting-IP`
 * when it is there. A client can forge that header where Cloudflare is not
 * in front; that only splits its own allowance, because the all-visitors
 * budget and the concurrency gate still bound what the engine spends.
 */
export function visitorKey(request: FastifyRequest): string {
  const header = request.headers['cf-connecting-ip'];
  const address = typeof header === 'string' ? header.trim() : '';
  return address && address.length <= 64 ? `cf:${address}` : request.ip;
}
