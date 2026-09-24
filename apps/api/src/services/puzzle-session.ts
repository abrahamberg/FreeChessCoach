import { applyUciSequence } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionMessageRow, PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

/** The live position for `session`'s current item — `item.fen` with
 * `item.moves.slice(0, session.currentPly)` already applied. Shared by
 * `getPuzzleSessionDetail` and `puzzle-move-commit.ts` so both agree on
 * exactly the same replay. */
export function currentPuzzleFen(session: PuzzleSessionRow, assignment: puzzleAssignmentsRepo.PuzzleAssignmentRow): string {
  const item = assignment.items[session.currentItemIndex];
  if (!item) return assignment.items[0]?.fen ?? '';
  const { moves } = applyUciSequence(item.fen, item.moves.slice(0, session.currentPly));
  return moves.at(-1)?.fen ?? item.fen;
}

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
  currentFen: string;
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
  return { ...session, messages, assignment, currentFen: currentPuzzleFen(session, assignment) };
}

/** Student-initiated "start over" (same menu item as the coach game's Reset):
 * abandons the current session and opens a fresh one — new conversation, on
 * the item the student was on, with the line back at its setup position. */
export async function resetPuzzleSession(db: Kysely<Database>, userId: string, sessionId: string): Promise<PuzzleSessionRow> {
  const session = await puzzleSessionsRepo.findSessionByIdForUser(db, sessionId, userId);
  if (!session) throw new NotFoundError('Puzzle session not found');
  if (session.status !== 'active') throw new ConflictError('Session has already ended');

  await puzzleSessionsRepo.markAbandoned(db, session.id);
  return puzzleSessionsRepo.insertSession(db, {
    assignmentId: session.assignmentId,
    userId,
    currentItemIndex: session.currentItemIndex
  });
}
