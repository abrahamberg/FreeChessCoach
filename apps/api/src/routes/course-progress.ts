import {
  CourseDaySchema,
  CourseProgressLookupRequestSchema,
  ImportCourseProgressRequestSchema,
  SaveCourseEnrollmentRequestSchema,
  type CourseEnrollmentListResponse,
  RecordCourseDrillRequestSchema,
  type CourseProgressResponse,
  type CourseReviewDueResponse
} from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import * as progress from '../services/courses/progress.js';
import * as userProfileService from '../services/user-profile.js';

/**
 * docs/courses.md §11: a signed-in learner's drill results, review schedule
 * and the courses they are on. Any signed-in user, not only creators; the anonymous learner's
 * progress stays in the browser until they sign in and it is imported here.
 */
export function registerCourseProgressRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  const userId = async (request: FastifyRequest): Promise<string> => (await userProfileService.getOrCreate(db, request.user)).id;

  app.post('/api/course-progress/drills', async (request): Promise<CourseProgressResponse> => {
    const body = parse(RecordCourseDrillRequestSchema, request.body);
    return { items: await progress.recordDrill(db, await userId(request), body) };
  });

  app.post('/api/course-progress/lookup', async (request): Promise<CourseProgressResponse> => {
    const { keys } = parse(CourseProgressLookupRequestSchema, request.body);
    return { items: await progress.lookup(db, await userId(request), keys) };
  });

  app.post('/api/course-progress/import', async (request, reply) => {
    const { items, enrollments } = parse(ImportCourseProgressRequestSchema, request.body);
    await progress.importProgress(db, await userId(request), items, enrollments);
    return reply.code(204).send();
  });

  /** docs/courses.md §11: the courses the learner is on, and where they are in each. */
  app.get('/api/course-enrollments', async (request): Promise<CourseEnrollmentListResponse> => ({
    items: await progress.listEnrollments(db, await userId(request))
  }));

  app.put('/api/course-enrollments/:slug', async (request, reply) => {
    const { slug } = parse(SlugParamsSchema, request.params);
    await progress.saveEnrollment(db, await userId(request), slug, parse(SaveCourseEnrollmentRequestSchema, request.body));
    return reply.code(204).send();
  });

  app.delete('/api/course-enrollments/:slug', async (request, reply) => {
    const { slug } = parse(SlugParamsSchema, request.params);
    await progress.removeEnrollment(db, await userId(request), slug);
    return reply.code(204).send();
  });

  app.get('/api/course-progress/due', async (request): Promise<CourseReviewDueResponse> => {
    const { today } = parse(z.object({ today: CourseDaySchema }), request.query);
    return progress.due(db, await userId(request), today);
  });
}

const SlugParamsSchema = z.object({ slug: z.string().min(1).max(120) });

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
  return result.data;
}
