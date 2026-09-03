import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export type PuzzleSessionStatus = 'active' | 'completed' | 'paused_no_credits' | 'abandoned';

export interface PuzzleSessionRow {
  id: string;
  assignmentId: string;
  userId: string;
  status: PuzzleSessionStatus;
  currentItemIndex: number;
  startedAt: Date;
  endedAt: Date | null;
}

export interface NewPuzzleSession {
  assignmentId: string;
  userId: string;
}

const BASE_COLUMNS = ['id', 'assignmentId', 'userId', 'status', 'currentItemIndex', 'startedAt', 'endedAt'] as const;

export function insertSession(db: Kysely<Database>, values: NewPuzzleSession): Promise<PuzzleSessionRow> {
  return db.insertInto('puzzleSessions').values({ ...values, status: 'active' }).returning(BASE_COLUMNS).executeTakeFirstOrThrow();
}

export function findSessionById(db: Kysely<Database>, id: string): Promise<PuzzleSessionRow | undefined> {
  return db.selectFrom('puzzleSessions').select(BASE_COLUMNS).where('id', '=', id).executeTakeFirst();
}

export function findSessionByIdForUser(db: Kysely<Database>, id: string, userId: string): Promise<PuzzleSessionRow | undefined> {
  return db
    .selectFrom('puzzleSessions')
    .select(BASE_COLUMNS)
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
}

/** The Practice page's "resume" link: an already-open session for this
 * assignment, if the student started one and came back later. */
export function findActiveByAssignmentId(db: Kysely<Database>, assignmentId: string): Promise<PuzzleSessionRow | undefined> {
  return db
    .selectFrom('puzzleSessions')
    .select(BASE_COLUMNS)
    .where('assignmentId', '=', assignmentId)
    .where('status', 'in', ['active', 'paused_no_credits'])
    .orderBy('startedAt', 'desc')
    .limit(1)
    .executeTakeFirst();
}

export function advanceItemIndex(db: Kysely<Database>, id: string, currentItemIndex: number): Promise<void> {
  return db.updateTable('puzzleSessions').set({ currentItemIndex }).where('id', '=', id).execute().then(() => undefined);
}

export function markCompleted(db: Kysely<Database>, id: string): Promise<void> {
  return db
    .updateTable('puzzleSessions')
    .set({ status: 'completed', endedAt: new Date() })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

export function markAbandoned(db: Kysely<Database>, id: string): Promise<void> {
  return db
    .updateTable('puzzleSessions')
    .set({ status: 'abandoned', endedAt: new Date() })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

export function markPausedNoCredits(db: Kysely<Database>, id: string): Promise<void> {
  return db.updateTable('puzzleSessions').set({ status: 'paused_no_credits' }).where('id', '=', id).execute().then(() => undefined);
}

export type PuzzleSessionMessageRole = 'user' | 'assistant' | 'tool';

export interface PuzzleSessionMessageRow {
  id: string;
  puzzleSessionId: string;
  role: PuzzleSessionMessageRole;
  content: unknown;
  itemIndex: number | null;
  createdAt: Date;
}

export function insertMessage(
  db: Kysely<Database>,
  puzzleSessionId: string,
  role: PuzzleSessionMessageRole,
  content: unknown,
  itemIndex: number | null = null
): Promise<PuzzleSessionMessageRow> {
  return db
    .insertInto('puzzleSessionMessages')
    .values({ puzzleSessionId, role, content: JSON.stringify(content), itemIndex })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Append-only replay order (same discipline as session-messages.ts's
 * listBySession — never mutate, never reorder). */
export function listMessagesBySession(db: Kysely<Database>, puzzleSessionId: string): Promise<PuzzleSessionMessageRow[]> {
  return db
    .selectFrom('puzzleSessionMessages')
    .selectAll()
    .where('puzzleSessionId', '=', puzzleSessionId)
    .orderBy('id', 'asc')
    .execute();
}
