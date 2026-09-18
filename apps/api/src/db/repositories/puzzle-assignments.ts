import type { Kysely } from 'kysely';
import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export type PuzzleAssignmentItemResult = 'pending' | 'solved' | 'failed' | 'skipped';

/** A `PuzzleRecord` (packages/chess-analysis/src/puzzle-selection.ts)
 * snapshotted at assignment time, widened with the student's progress on
 * it — never re-resolved against the live pool, so a later pool rebuild
 * can't shift a puzzle out from under an in-progress assignment. */
export interface PuzzleAssignmentItem {
  puzzleId: string;
  fen: string;
  moves: readonly string[];
  rating: number;
  themes: readonly string[];
  result: PuzzleAssignmentItemResult;
}

export type PuzzleAssignmentStatus = 'pending' | 'in_progress' | 'completed';

export interface PuzzleAssignmentRow {
  id: string;
  userId: string;
  diagnosisCode: DiagnosisCodeId;
  reason: string;
  items: PuzzleAssignmentItem[];
  status: PuzzleAssignmentStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface NewPuzzleAssignment {
  userId: string;
  diagnosisCode: DiagnosisCodeId;
  reason: string;
  items: PuzzleAssignmentItem[];
}

/** Task 59.3's background job — one assignment per `selectPuzzles` result
 * for a `probable`-or-better diagnosis with no open assignment already
 * covering it. Always created `pending`, with every item `pending`. */
export function insert(db: Kysely<Database>, assignment: NewPuzzleAssignment): Promise<PuzzleAssignmentRow> {
  return db
    .insertInto('puzzleAssignments')
    .values({ ...assignment, items: JSON.stringify(assignment.items) })
    .returningAll()
    .executeTakeFirstOrThrow() as Promise<PuzzleAssignmentRow>;
}

/** One assignment by id — Task 59.4's `POST /api/puzzle-sessions` reads
 * this to seed a new puzzle session. */
export function findById(db: Kysely<Database>, id: string): Promise<PuzzleAssignmentRow | undefined> {
  return db.selectFrom('puzzleAssignments').selectAll().where('id', '=', id).executeTakeFirst() as Promise<
    PuzzleAssignmentRow | undefined
  >;
}

/** The dashboard's "Practice ready" card (Task 59.6) — every assignment
 * still open for a student, newest first. */
export function listOpenForUser(db: Kysely<Database>, userId: string): Promise<PuzzleAssignmentRow[]> {
  return db
    .selectFrom('puzzleAssignments')
    .selectAll()
    .where('userId', '=', userId)
    .where('status', 'in', ['pending', 'in_progress'])
    .orderBy('createdAt', 'desc')
    .execute() as Promise<PuzzleAssignmentRow[]>;
}

/** Task 59.3's flood check: is there already an open assignment for this
 * (user, diagnosis code) pair? App-layer enforced, no DB constraint (see
 * 0028_puzzle_assignments.ts). */
export async function hasOpenAssignment(db: Kysely<Database>, userId: string, diagnosisCode: DiagnosisCodeId): Promise<boolean> {
  const row = await db
    .selectFrom('puzzleAssignments')
    .select('id')
    .where('userId', '=', userId)
    .where('diagnosisCode', '=', diagnosisCode)
    .where('status', 'in', ['pending', 'in_progress'])
    .executeTakeFirst();
  return row !== undefined;
}

/** Task 66.2's `assign_focused_session` live tool: the same lookup as
 * `hasOpenAssignment`, but returning the row itself — the tool needs to
 * point the coach back at the existing assignment (its id/item count)
 * rather than just knowing one exists. */
export function findOpenAssignment(
  db: Kysely<Database>,
  userId: string,
  diagnosisCode: DiagnosisCodeId
): Promise<PuzzleAssignmentRow | undefined> {
  return db
    .selectFrom('puzzleAssignments')
    .selectAll()
    .where('userId', '=', userId)
    .where('diagnosisCode', '=', diagnosisCode)
    .where('status', 'in', ['pending', 'in_progress'])
    .executeTakeFirst() as Promise<PuzzleAssignmentRow | undefined>;
}

/** Task 59.4's `advance_puzzle` tool: persist one item's outcome. Replaces
 * the whole `items` array (jsonb has no in-place element update) — callers
 * read-modify-write via `findById`. */
export function updateItems(db: Kysely<Database>, id: string, items: PuzzleAssignmentItem[]): Promise<void> {
  return db
    .updateTable('puzzleAssignments')
    .set({ items: JSON.stringify(items) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Task 59.4: a puzzle session starting/ending moves the assignment
 * through its own `status`, independent of `puzzle_sessions.status` (a
 * student could abandon and later resume a session against the same
 * still-`in_progress` assignment). */
export function markStarted(db: Kysely<Database>, id: string): Promise<void> {
  return db
    .updateTable('puzzleAssignments')
    .set({ status: 'in_progress', startedAt: new Date() })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .execute()
    .then(() => undefined);
}

export function markCompleted(db: Kysely<Database>, id: string): Promise<void> {
  return db
    .updateTable('puzzleAssignments')
    .set({ status: 'completed', completedAt: new Date() })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** services/account.ts's deletion cascade — run after
 * puzzleSessionsRepo.deleteSessionsByUserId, since puzzle_sessions
 * references assignment_id with no DB cascade. */
export function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  return db.deleteFrom('puzzleAssignments').where('userId', '=', userId).execute().then(() => undefined);
}
