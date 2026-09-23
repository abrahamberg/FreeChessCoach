import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface SessionMoveNoteRow {
  id: string;
  sessionId: string;
  ply: number;
  note: string;
  detail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Upsert-wins semantics keyed on (sessionId, ply) — same full-replace
 * philosophy as update_threads: whichever write happens last for a ply
 * wins, whether that's the coach's record_move_note or the automatic
 * episode-close fallback (design doc §3). */
export function upsert(
  db: Kysely<Database>,
  sessionId: string,
  ply: number,
  note: string
): Promise<SessionMoveNoteRow> {
  return db
    .insertInto('sessionMoveNotes')
    .values({ sessionId, ply, note })
    .onConflict((oc) => oc.columns(['sessionId', 'ply']).doUpdateSet({ note, updatedAt: new Date() }))
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Stores `detail` as the session's one long-form "latest episode" summary:
 * clears it from every other ply, then sets it on `ply` (creating the row,
 * with a truncated `detail` as its short note, if the episode has none). */
export async function setLatestDetail(
  db: Kysely<Database>,
  sessionId: string,
  ply: number,
  detail: string
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('sessionMoveNotes')
      .set({ detail: null })
      .where('sessionId', '=', sessionId)
      .where('ply', '!=', ply)
      .where('detail', 'is not', null)
      .execute();
    await trx
      .insertInto('sessionMoveNotes')
      .values({ sessionId, ply, note: detail.slice(0, 300), detail })
      .onConflict((oc) => oc.columns(['sessionId', 'ply']).doUpdateSet({ detail }))
      .execute();
  });
}

/** Play-mode undo (architecture.md §14): removes the note for a ply whose
 * move no longer exists in the game, so it can never resurface in the
 * "other moves discussed" summary. */
export function deleteByPly(db: Kysely<Database>, sessionId: string, ply: number): Promise<void> {
  return db
    .deleteFrom('sessionMoveNotes')
    .where('sessionId', '=', sessionId)
    .where('ply', '=', ply)
    .execute()
    .then(() => undefined);
}

/** Game deletion cascade (services/games.ts deleteGameForUser). */
export function deleteBySessionId(db: Kysely<Database>, sessionId: string): Promise<void> {
  return db.deleteFrom('sessionMoveNotes').where('sessionId', '=', sessionId).execute().then(() => undefined);
}

export function findByPly(
  db: Kysely<Database>,
  sessionId: string,
  ply: number
): Promise<SessionMoveNoteRow | undefined> {
  return db
    .selectFrom('sessionMoveNotes')
    .selectAll()
    .where('sessionId', '=', sessionId)
    .where('ply', '=', ply)
    .executeTakeFirst();
}

/** Other-moves-summary layer (design doc §5): every discussed ply except
 * the ones already covered elsewhere this turn, oldest first. Normally
 * that's just the subject ply (in the episode's own conversation already);
 * mid-flashback it's the subject AND the board ply (the board ply's own
 * fresh analysis is already in "## Current position", so repeating its
 * note here would just be redundant). */
export function listOtherPlies(
  db: Kysely<Database>,
  sessionId: string,
  excludePlies: number[]
): Promise<SessionMoveNoteRow[]> {
  return db
    .selectFrom('sessionMoveNotes')
    .selectAll()
    .where('sessionId', '=', sessionId)
    .where('ply', 'not in', excludePlies)
    .orderBy('ply', 'asc')
    .execute();
}
