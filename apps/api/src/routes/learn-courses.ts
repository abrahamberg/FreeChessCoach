import { CourseCatalogQuerySchema, type CourseCatalogResponse, type PublicCourseResponse } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { parseRequest } from '../lib/parse-request.js';
import type { AudioStore } from '../services/courses/audio-store.js';
import { courseCatalogue, publicCourse } from '../services/courses/public-course.js';
import * as userProfileService from '../services/user-profile.js';
import { parseParams, SlugParamsSchema } from './public-courses.js';

/**
 * docs/courses.md §9: the course page's data for a signed-in learner — the
 * public routes' answers plus the members-only courses this user may open
 * (their access level, or their own). Behind the login, and never cached
 * by a shared cache, since the answer depends on who asks.
 */
export function registerLearnCoursesRoutes(app: FastifyInstance, db: Kysely<Database>, audioStore?: AudioStore): void {
  app.get('/api/learn/courses', async (request, reply): Promise<CourseCatalogResponse> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const page = await courseCatalogue(db, parseRequest(CourseCatalogQuerySchema, request.query), user.id);
    void reply.header('cache-control', 'private, no-store');
    return page;
  });

  app.get('/api/learn/courses/:slug', async (request, reply): Promise<PublicCourseResponse> => {
    const { slug } = parseParams(SlugParamsSchema, request.params);
    const user = await userProfileService.getOrCreate(db, request.user);
    const course = await publicCourse(db, slug, user.id, audioStore);
    void reply.header('cache-control', 'private, no-store');
    return course;
  });
}
