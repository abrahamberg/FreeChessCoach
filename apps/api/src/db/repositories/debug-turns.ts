import { DEBUG_TURNS_MAX, type DebugTurn } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

/** Whose turn it is: a coach session or a practice (puzzle) session. */
export type DebugTurnOwner = { sessionId: string } | { puzzleSessionId: string };

function ownerColumn(owner: DebugTurnOwner): { column: 'sessionId' | 'puzzleSessionId'; id: string } {
  return 'sessionId' in owner ? { column: 'sessionId', id: owner.sessionId } : { column: 'puzzleSessionId', id: owner.puzzleSessionId };
}

/** Appends one turn's snapshot and drops the oldest past DEBUG_TURNS_MAX. */
export async function insert(db: Kysely<Database>, owner: DebugTurnOwner, snapshot: unknown): Promise<void> {
  const { column, id } = ownerColumn(owner);
  await db
    .insertInto('debugTurns')
    .values({ sessionId: null, puzzleSessionId: null, [column]: id, snapshot: JSON.stringify(snapshot) })
    .execute();
  await db
    .deleteFrom('debugTurns')
    .where(column, '=', id)
    .where('id', 'not in', db.selectFrom('debugTurns').select('id').where(column, '=', id).orderBy('id', 'desc').limit(DEBUG_TURNS_MAX))
    .execute();
}

/** Oldest first. */
export async function list(db: Kysely<Database>, owner: DebugTurnOwner): Promise<DebugTurn[]> {
  const { column, id } = ownerColumn(owner);
  const rows = await db.selectFrom('debugTurns').select(['snapshot', 'createdAt']).where(column, '=', id).orderBy('id').execute();
  return rows.map((row) => ({ at: row.createdAt.toISOString(), snapshot: row.snapshot }));
}
