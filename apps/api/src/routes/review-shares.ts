import { ReviewShareTokenSchema, type ReviewShareState, type SharedReview } from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { SHARE_LINK_PREFIX } from '../plugins/auth-headers.js';
import { ROUTE_RATE_LIMITS, rateLimitConfig } from '../plugins/route-rate-limit.js';
import { renderShareCard } from '../services/review-share/share-card.js';
import { shareReview, shareState, sharedReview, sharedReviewImage, stopSharing } from '../services/review-share/review-share.js';
import * as userProfileService from '../services/user-profile.js';

const TokenParamsSchema = z.object({ token: ReviewShareTokenSchema });
const GameParamsSchema = z.object({ id: z.string().uuid() });


/**
 * Growth plan A6, docs/threat-model.md T16. The owner's three routes sit
 * behind the login like every game route. The public ones read nothing but
 * the token and never `request.user`: `/api/public/shared-reviews/*` (the
 * review and its picture) and `/s/:token` (the preview page), both skip-auth
 * at the proxy and exempt in auth-headers.ts by the matched route.
 */
export function registerReviewSharesRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get('/api/games/:id/share', async (request): Promise<ReviewShareState> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    return shareState(db, user.id, gameId(request.params));
  });

  app.post('/api/games/:id/share', async (request): Promise<ReviewShareState> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    return shareReview(db, user.id, gameId(request.params));
  });

  app.delete('/api/games/:id/share', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    await stopSharing(db, user.id, gameId(request.params));
    return reply.code(204).send();
  });

  const limit = rateLimitConfig(ROUTE_RATE_LIMITS.publicReview);

  app.get('/api/public/shared-reviews/:token', limit, async (request, reply): Promise<SharedReview> => {
    const review = await sharedReview(db, token(request.params));
    // Short, so a link the owner turns off stops working within a minute.
    void reply.header('cache-control', 'public, max-age=60');
    return review;
  });

  app.get('/api/public/shared-reviews/:token/image.png', limit, async (request, reply) => {
    const image = await sharedReviewImage(db, token(request.params));
    return reply.header('cache-control', 'public, max-age=300').type('image/png').send(image);
  });

  app.get(`${SHARE_LINK_PREFIX}:token`, limit, async (request, reply) => {
    const shareToken = token(request.params);
    const html = renderShareCard(await sharedReview(db, shareToken), shareToken, siteOrigin(request));
    return reply
      .header('cache-control', 'public, max-age=60')
      .header('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'strict-origin-when-cross-origin')
      .type('text/html; charset=utf-8')
      .send(html);
  });
}

/** A malformed token is a wrong link, not a bad request. */
function token(params: unknown): string {
  const parsed = TokenParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError('No review at this link');
  return parsed.data.token;
}

function gameId(params: unknown): string {
  const parsed = GameParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError('Game not found');
  return parsed.data.id;
}

/** The site's address as the visitor reached it, for the absolute preview
 * URLs. Anything that is not a plain host name falls back to the site's own. */
function siteOrigin(request: FastifyRequest): string {
  const name = request.headers.host;
  if (!name || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(name)) return 'https://freechesscoach.org';
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(name);
  return `${local ? 'http' : 'https'}://${name.toLowerCase()}`;
}
