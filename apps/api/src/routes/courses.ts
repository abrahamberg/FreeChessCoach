import { CreateCourseRequestSchema, SaveCourseDraftRequestSchema, type CourseListResponse, type CourseResponse } from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { EngineUnavailableError, NotFoundError, ValidationError } from '../lib/errors.js';
import type { CourseDossierBuilder } from '../services/course-dossier.js';
import * as coursesService from '../services/courses.js';
import { requireCourseCreator } from '../services/courses/require-course-creator.js';
import * as userProfileService from '../services/user-profile.js';

const CourseParamsSchema = z.object({ id: z.string().uuid() });

/**
 * The creator's course editor (docs/courses.md §2, §10). Every route is
 * behind `requireCourseCreator`. `buildDossier` is absent when the app has
 * no engine; then only building the skeleton is refused.
 */
export function registerCoursesRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  buildDossier: CourseDossierBuilder | undefined
): void {
  const creatorId = async (request: FastifyRequest): Promise<string> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    requireCourseCreator(user);
    return user.id;
  };

  app.post('/api/courses', async (request, reply): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const course = await coursesService.createCourse(db, ownerId, parseBody(CreateCourseRequestSchema, request.body));
    return reply.code(201).send(course);
  });

  app.get('/api/courses', async (request): Promise<CourseListResponse> => coursesService.listCourses(db, await creatorId(request)));

  app.get('/api/courses/:id', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    return coursesService.getCourse(db, ownerId, courseId(request));
  });

  /** 204, like every PUT in this app; the client already holds what it saved. */
  app.put('/api/courses/:id/draft', async (request, reply) => {
    const ownerId = await creatorId(request);
    const { document } = parseBody(SaveCourseDraftRequestSchema, request.body);
    await coursesService.saveDraft(db, ownerId, courseId(request), document);
    return reply.code(204).send();
  });

  app.post('/api/courses/:id/skeleton', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    if (!buildDossier) throw new EngineUnavailableError('No engine is configured');
    return coursesService.buildSkeletonDraft(db, ownerId, courseId(request), buildDossier);
  });
}

function courseId(request: FastifyRequest): string {
  const parsed = CourseParamsSchema.safeParse(request.params);
  if (!parsed.success) throw new NotFoundError('Course not found');
  return parsed.data.id;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
  return parsed.data;
}
