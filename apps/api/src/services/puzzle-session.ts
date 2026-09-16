import type { Kysely } from 'kysely';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionMessageRow, PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

/** Starts a fresh puzzle session for an assignment — no seed message (unlike
 * createSessionForGame's `[session_start]`): puzzle-session-turn.ts's
 * startPuzzleTurn synthesizes an opening turn on demand when history is
 * empty, so there is nothing to persist up front. */
export async function createPuzzleSession(db: Kysely<Database>, userId: string, assignmentId: string): Promise<PuzzleSessionRow> {
  const assignment = await puzzleAssignmentsRepo.findById(db, assignmentId);
  if (!assignment || assignment.userId !== userId) throw new NotFoundError('Assignment not found');
  if (assignment.status === 'completed') throw new ConflictError('This assignment is already completed');

  const session = await puzzleSessionsRepo.insertSession(db, { assignmentId, userId });
  // No-op if already in_progress (markStarted only fires from 'pending') —
  // a student resuming into a second session on the same still-open
  // assignment (after e.g. abandoning the first) must not reset startedAt.
  await puzzleAssignmentsRepo.markStarted(db, assignmentId);
  return session;
}

/** The Practice card's "Start"/"Continue" action: link back into an
 * already-open session for this assignment instead of starting a second
 * one over it, same resume-or-create shape as resumeOrCreateSession
 * (coach-agent-session.ts). */
export async function resumeOrCreatePuzzleSession(
  db: Kysely<Database>,
  userId: string,
  assignmentId: string
): Promise<PuzzleSessionRow> {
  const existing = await puzzleSessionsRepo.findActiveByAssignmentId(db, assignmentId);
  if (existing) return existing;
  return createPuzzleSession(db, userId, assignmentId);
}

export interface PuzzleSessionDetail extends PuzzleSessionRow {
  messages: PuzzleSessionMessageRow[];
  assignment: puzzleAssignmentsRepo.PuzzleAssignmentRow;
}

export async function getPuzzleSessionDetail(
  db: Kysely<Database>,
  sessionId: string,
  userId: string
): Promise<PuzzleSessionDetail | undefined> {
  const session = await puzzleSessionsRepo.findSessionByIdForUser(db, sessionId, userId);
  if (!session) return undefined;
  const [messages, assignment] = await Promise.all([
    puzzleSessionsRepo.listMessagesBySession(db, sessionId),
    puzzleAssignmentsRepo.findById(db, session.assignmentId)
  ]);
  if (!assignment) return undefined;
  return { ...session, messages, assignment };
}
