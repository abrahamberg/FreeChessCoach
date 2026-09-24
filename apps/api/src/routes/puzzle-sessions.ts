import {
  AdvancePuzzleItemResponseSchema,
  CreatePuzzleSessionRequestSchema,
  PostSessionMessageRequestSchema
} from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import type { CoachAgentBaseDependencies } from '../bootstrap.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { pipeCoachStreamToResponse } from '../llm/stream-response.js';
import { getPuzzleSessionDetail, resetPuzzleSession, resumeOrCreatePuzzleSession } from '../services/puzzle-session.js';
import { advancePuzzleItem } from '../services/puzzle-item-advance.js';
import { startPuzzleTurn, type PuzzleTurnDependencies } from '../services/puzzle-session-turn.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import { resolveEngineBackend, type ResolveEngineBackendOptions } from '../services/engine/resolve-engine-backend.js';
import * as userProfileService from '../services/user-profile.js';

/**
 * docs/plan.md Phase 59, Task 59.4 — puzzle-session routes. Mirrors
 * routes/sessions.ts's analyze-mode shape (create/detail/messages) but
 * against puzzle_sessions, not sessions: no play-move/bot/reset routes
 * (none of that exists for a puzzle set), and POST /messages reuses the
 * exact same streaming plumbing (pipeCoachStreamToResponse over a
 * reply.hijack()'d response).
 */
export function registerPuzzleSessionsRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  baseDeps: CoachAgentBaseDependencies,
  engineBackendOptions?: ResolveEngineBackendOptions
): void {
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

  // Deterministic, LLM-free "move on" action: the client offers this once
  // the coach has played the line out (lineComplete), so a student is never stuck waiting
  // on the coach's own advance_puzzle tool call. Only ever records "solved"
  // (this is a completion action, not a way to skip a puzzle early) and only
  // once the line is actually complete server-side — never trusts the client
  // on that fact. advancePuzzleItem's own idempotency guard makes this safe
  // to call even if the coach's tool call already moved the session on.
  app.post<{ Params: { id: string } }>('/api/puzzle-sessions/:id/advance-item', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await puzzleSessionsRepo.findSessionByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Puzzle session not found');
    if (session.status !== 'active') throw new ConflictError('This session is not active');

    const assignment = await puzzleAssignmentsRepo.findById(db, session.assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const item = assignment.items[session.currentItemIndex];
    if (!item) throw new ConflictError('This session has no current puzzle — it may already be complete');
    if (session.currentPly < item.moves.length) throw new ConflictError('This puzzle is not solved yet');

    const result = await advancePuzzleItem(db, assignment, session, session.currentItemIndex, 'solved');
    return AdvancePuzzleItemResponseSchema.parse(result);
  });

  app.post<{ Params: { id: string } }>('/api/puzzle-sessions/:id/reset', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    return resetPuzzleSession(db, user.id, request.params.id);
  });

  // Same "Debug last answer" snapshot the coach game exposes.
  app.get<{ Params: { id: string } }>('/api/puzzle-sessions/:id/debug/last-turn', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await puzzleSessionsRepo.findSessionByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Puzzle session not found');
    const snapshot = await puzzleSessionsRepo.getDebugSnapshot(db, session.id);
    if (!snapshot) throw new NotFoundError('No completed turn to debug yet');
    return snapshot;
  });

  app.post<{ Params: { id: string } }>('/api/puzzle-sessions/:id/messages', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await puzzleSessionsRepo.findSessionByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Puzzle session not found');

    const parsed = PostSessionMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    // Cached backend, same as the game coach: the position analysis is
    // requested every turn, so repeats of a fen must not re-search.
    const backend = engineBackendOptions ? await resolveEngineBackend(engineBackendOptions, user.id) : undefined;
    const turnDeps: PuzzleTurnDependencies = {
      db: baseDeps.db,
      gatewayConfig: baseDeps.gatewayConfig,
      resolveModel: baseDeps.resolveModel,
      analyzePosition: backend ? (fen) => backend.analyzePosition(fen) : undefined
    };
    const turn = await startPuzzleTurn(turnDeps, session, parsed.data);

    reply.hijack();
    void pipeCoachStreamToResponse(reply.raw, turn);
  });
}
