import { CreateCourseApiTokenRequestSchema, type CourseApiTokenListResponse, type CreateCourseApiTokenResponse } from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { parseRequest } from '../lib/parse-request.js';
import { createCourseToken, listCourseTokens, revokeCourseToken } from '../services/courses/course-tokens.js';
import { requireCourseEditor } from '../services/courses/require-course-editor.js';
import * as userProfileService from '../services/user-profile.js';

const TokenParamsSchema = z.object({ id: z.string().uuid() });

/** docs/courses.md §2: an editor's own tokens for the course API. Only the
 * signed-in browser reaches these: a token cannot make or see tokens. */
export function registerCourseTokensRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  const editorId = async (request: FastifyRequest): Promise<string> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    requireCourseEditor(user);
    return user.id;
  };

  app.get('/api/course-tokens', async (request): Promise<CourseApiTokenListResponse> => listCourseTokens(db, await editorId(request)));

  /** 201; the token is in this answer only. */
  app.post('/api/course-tokens', async (request, reply): Promise<CreateCourseApiTokenResponse> => {
    const { name } = parseRequest(CreateCourseApiTokenRequestSchema, request.body);
    return reply.code(201).send(await createCourseToken(db, await editorId(request), name));
  });

  /** 204. */
  app.delete('/api/course-tokens/:id', async (request, reply) => {
    const params = TokenParamsSchema.safeParse(request.params);
    if (!params.success) throw new NotFoundError('Token not found');
    await revokeCourseToken(db, await editorId(request), params.data.id);
    return reply.code(204).send();
  });
}
