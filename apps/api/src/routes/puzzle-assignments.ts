import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as userProfileService from '../services/user-profile.js';

/**
 * docs/plan.md Phase 59 — beyond Task 59.4's own file list, but needed for
 * it to be usable at all: the dashboard's "Practice ready" card (Task
 * 59.6) has to list a student's open assignments from somewhere, and
 * nothing else in this plan exposes puzzleAssignmentsRepo.listOpenForUser
 * over HTTP. Kept as its own small route file rather than folded into
 * puzzle-sessions.ts — assignments and sessions are related but distinct
 * resources (an assignment can exist with no session yet).
 */
export function registerPuzzleAssignmentsRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get('/api/puzzle-assignments', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    return puzzleAssignmentsRepo.listOpenForUser(db, user.id);
  });
}
