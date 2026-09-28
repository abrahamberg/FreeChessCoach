import { AskCourseCoachRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { CoachAgentBaseDependencies } from '../bootstrap.js';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { pipeCoachStreamToResponse } from '../llm/stream-response.js';
import { askCourseCoach } from '../services/courses/ask-coach.js';
import { resolveEngineBackend, type ResolveEngineBackendOptions } from '../services/engine/resolve-engine-backend.js';
import * as userProfileService from '../services/user-profile.js';

/**
 * docs/courses.md §11: "Ask my coach" on a course position. Signed-in
 * learners only (not under /api/public), with their own AI setup; streamed
 * like the other coach chats. Nothing is stored.
 */
export function registerCourseQuestionRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  baseDeps: CoachAgentBaseDependencies,
  engineBackendOptions?: ResolveEngineBackendOptions
): void {
  app.post('/api/course-questions', async (request, reply) => {
    const parsed = AskCourseCoachRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    const user = await userProfileService.getOrCreate(db, request.user);
    const backend = engineBackendOptions ? await resolveEngineBackend(engineBackendOptions, user.id) : undefined;
    const turn = await askCourseCoach(
      {
        db: baseDeps.db,
        gatewayConfig: baseDeps.gatewayConfig,
        resolveModel: baseDeps.resolveModel,
        analyzePosition: backend ? (fen) => backend.analyzePosition(fen) : undefined
      },
      user.id,
      parsed.data
    );
    reply.hijack();
    void pipeCoachStreamToResponse(reply.raw, turn);
  });
}
