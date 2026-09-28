import type { PublicCourseResponse } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { ROUTE_RATE_LIMITS, rateLimitConfig } from '../plugins/route-rate-limit.js';
import { publicCourse, publicNoteAudio } from '../services/courses/public-course.js';

const SlugParamsSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });
const AudioParamsSchema = SlugParamsSchema.extend({ file: z.string().max(40) });

/**
 * docs/courses.md §9: the read-only course page's data, with no login
 * (`/api/public/` is skip-auth at the proxy and exempt in auth-headers.ts).
 * Nothing here reads `request.user`. Anonymous visitors all reach the api
 * from the proxy's address, so the per-route cap is shared by them
 * (docs/threat-model.md T13).
 */
export function registerPublicCoursesRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  const limit = rateLimitConfig(ROUTE_RATE_LIMITS.publicCourse);

  app.get('/api/public/courses/:slug', limit, async (request, reply): Promise<PublicCourseResponse> => {
    const { slug } = parseParams(SlugParamsSchema, request.params);
    const course = await publicCourse(db, slug);
    // Short, so a course the moderator removes is gone within a minute.
    void reply.header('cache-control', 'public, max-age=60');
    return course;
  });

  // Named by its bytes' hash, so a URL never changes content: cached for a
  // year, at the edge too (docs/courses.md §9). A removed course's files
  // stay in those caches until purged.
  app.get('/api/public/courses/:slug/audio/:file', limit, async (request, reply) => {
    const { slug, file } = parseParams(AudioParamsSchema, request.params);
    const audio = await publicNoteAudio(db, slug, file);
    return reply.header('cache-control', 'public, max-age=31536000, immutable').type(audio.mimeType).send(audio.bytes);
  });
}

/** A malformed slug or hash is a wrong link, not a bad request. */
function parseParams<S extends z.ZodType>(schema: S, params: unknown): z.output<S> {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new NotFoundError('No course at this link');
  return parsed.data;
}
