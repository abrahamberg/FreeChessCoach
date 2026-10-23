import { CourseCatalogQuerySchema, type CourseCatalogResponse, type PublicCourseResponse } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { parseRequest } from '../lib/parse-request.js';
import { ROUTE_RATE_LIMITS, rateLimitConfig } from '../plugins/route-rate-limit.js';
import type { AudioStore } from '../services/courses/audio-store.js';
import { courseCatalogue, publicCourse } from '../services/courses/public-course.js';

export const SlugParamsSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

/**
 * docs/courses.md §9: the read-only course page's data, with no login
 * (`/api/public/` is skip-auth at the proxy and exempt in auth-headers.ts).
 * Nothing here reads `request.user`. Anonymous visitors all reach the api
 * from the proxy's address, so the per-route cap is shared by them
 * (docs/threat-model.md T13).
 */
export function registerPublicCoursesRoutes(app: FastifyInstance, db: Kysely<Database>, audioStore?: AudioStore): void {
  const limit = rateLimitConfig(ROUTE_RATE_LIMITS.publicCourse);

  // The catalogue: public courses only; unlisted ones are for their link,
  // members-only ones for /api/learn/courses.
  app.get('/api/public/courses', limit, async (request, reply): Promise<CourseCatalogResponse> => {
    const page = await courseCatalogue(db, parseRequest(CourseCatalogQuerySchema, request.query), null);
    void reply.header('cache-control', 'public, max-age=60');
    return page;
  });

  app.get('/api/public/courses/:slug', limit, async (request, reply): Promise<PublicCourseResponse> => {
    const { slug } = parseParams(SlugParamsSchema, request.params);
    const course = await publicCourse(db, slug, null, audioStore);
    // Short, so a course the moderator removes is gone within a minute.
    void reply.header('cache-control', 'public, max-age=60');
    return course;
  });
}

/** A malformed slug or hash is a wrong link, not a bad request. */
export function parseParams<S extends z.ZodType>(schema: S, params: unknown): z.output<S> {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new NotFoundError('No course at this link');
  return parsed.data;
}
