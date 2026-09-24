import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export type PuzzleSessionStatus = 'active' | 'completed' | 'abandoned';

export interface PuzzleSessionRow {
  id: string;
  assignmentId: string;
  userId: string;
  status: PuzzleSessionStatus;
  currentItemIndex: number;
  /** How many of the current item's solution-line moves have been applied
   * to the live position — see 0040_puzzle_session_ply.ts. */
  currentPly: number;
  startedAt: Date;
  endedAt: Date | null;
}

export interface NewPuzzleSession {
  assignmentId: string;
  userId: string;
  /** Defaults to the first item; a reset restarts on the item the student was on. */
  currentItemIndex?: number;
}

const BASE_COLUMNS = ['id', 'assignmentId', 'userId', 'status', 'currentItemIndex', 'currentPly', 'startedAt', 'endedAt'] as const;

/** `currentPly` starts at 1 (its column default) — the item's `moves[0]`
 * is always the opponent's forced setup move, auto-applied with no student
 * decision (see puzzle-coach-system.ts), so a fresh session opens already
 * past it. */
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
    .where('status', '=', 'active')
    .orderBy('startedAt', 'desc')
    .limit(1)
    .executeTakeFirst();
}

/** Moving to a new item always resets `currentPly` to 1 (its own setup
 * move auto-applied, same as a fresh session — see `insertSession`). */
export function advanceItemIndex(db: Kysely<Database>, id: string, currentItemIndex: number): Promise<void> {
  return db
    .updateTable('puzzleSessions')
    .set({ currentItemIndex, currentPly: 1 })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

/** Persists a move-attempt outcome — `puzzle-move-commit.ts`'s only write. */
export function advancePly(db: Kysely<Database>, id: string, currentPly: number): Promise<void> {
  return db.updateTable('puzzleSessions').set({ currentPly }).where('id', '=', id).execute().then(() => undefined);
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

/** services/account.ts's deletion cascade — every puzzle session id to
 * clear messages for (deleteMessagesBySessionId) before deleteSessionsByUserId. */
export async function listSessionIdsByUserId(db: Kysely<Database>, userId: string): Promise<string[]> {
  const rows = await db.selectFrom('puzzleSessions').select('id').where('userId', '=', userId).execute();
  return rows.map((row) => row.id);
}

export function deleteSessionsByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  return db.deleteFrom('puzzleSessions').where('userId', '=', userId).execute().then(() => undefined);
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

/** services/account.ts's deletion cascade — a puzzle session's messages
 * must go before the session itself (no DB cascade, same discipline as
 * services/games.ts's cascadeDeleteGame). */
export function deleteMessagesBySessionId(db: Kysely<Database>, puzzleSessionId: string): Promise<void> {
  return db
    .deleteFrom('puzzleSessionMessages')
    .where('puzzleSessionId', '=', puzzleSessionId)
    .execute()
    .then(() => undefined);
}

/** Latest-turn-only, overwritten each turn — same contract as sessionsRepo.updateDebugSnapshot. */
export function updateDebugSnapshot(db: Kysely<Database>, id: string, snapshot: unknown): Promise<void> {
  return db
    .updateTable('puzzleSessions')
    .set({ debugSnapshot: JSON.stringify(snapshot) })
    .where('id', '=', id)
    .execute()
    .then(() => undefined);
}

export async function getDebugSnapshot(db: Kysely<Database>, id: string): Promise<unknown> {
  const row = await db.selectFrom('puzzleSessions').select('debugSnapshot').where('id', '=', id).executeTakeFirst();
  return row?.debugSnapshot ?? undefined;
}
