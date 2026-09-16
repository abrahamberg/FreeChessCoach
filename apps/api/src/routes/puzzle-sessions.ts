import { CreatePuzzleSessionRequestSchema, PostSessionMessageRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import type { CoachAgentBaseDependencies } from '../bootstrap.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { pipeCoachStreamToResponse } from '../llm/stream-response.js';
import { getPuzzleSessionDetail, resumeOrCreatePuzzleSession } from '../services/puzzle-session.js';
import { startPuzzleTurn, type PuzzleTurnDependencies } from '../services/puzzle-session-turn.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as userProfileService from '../services/user-profile.js';

/**
 * docs/plan.md Phase 59, Task 59.4 — puzzle-session routes. Mirrors
 * routes/sessions.ts's analyze-mode shape (create/detail/messages) but
 * against puzzle_sessions, not sessions: no play-move/bot/reset routes
 * (none of that exists for a puzzle set), and POST /messages reuses the
 * exact same streaming plumbing (pipeCoachStreamToResponse over a
 * reply.hijack()'d response).
 */
export function registerPuzzleSessionsRoutes(app: FastifyInstance, db: Kysely<Database>, baseDeps: CoachAgentBaseDependencies): void {
  app.post('/api/puzzle-sessions', async (request) => {
    const parsed = CreatePuzzleSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    return resumeOrCreatePuzzleSession(db, user.id, parsed.data.assignmentId);
  });

  app.get<{ Params: { id: string } }>('/api/puzzle-sessions/:id', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const detail = await getPuzzleSessionDetail(db, request.params.id, user.id);
    if (!detail) throw new NotFoundError('Puzzle session not found');
    return detail;
  });

  app.post<{ Params: { id: string } }>('/api/puzzle-sessions/:id/messages', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await puzzleSessionsRepo.findSessionByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Puzzle session not found');

    const parsed = PostSessionMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const turnDeps: PuzzleTurnDependencies = { db: baseDeps.db, gatewayConfig: baseDeps.gatewayConfig, resolveModel: baseDeps.resolveModel };
    const turn = await startPuzzleTurn(turnDeps, session, parsed.data);

    reply.hijack();
    void pipeCoachStreamToResponse(reply.raw, turn);
  });
}
