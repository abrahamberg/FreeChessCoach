import type { Kysely } from 'kysely';
import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export interface SessionProgressNoteRow {
  id: string;
  sessionId: string;
  diagnosisCode: DiagnosisCodeId | null;
  note: string;
  createdAt: Date;
}

export function insert(
  db: Kysely<Database>,
  sessionId: string,
  diagnosisCode: DiagnosisCodeId | null,
  note: string
): Promise<SessionProgressNoteRow> {
  return db.insertInto('sessionProgressNotes').values({ sessionId, diagnosisCode, note }).returningAll().executeTakeFirstOrThrow();
}

/** Oldest first: the order the coach left them in. */
export function listBySession(db: Kysely<Database>, sessionId: string): Promise<SessionProgressNoteRow[]> {
  return db.selectFrom('sessionProgressNotes').selectAll().where('sessionId', '=', sessionId).orderBy('id', 'asc').execute();
}

/** Game deletion cascade (services/games.ts cascadeDeleteGame). */
export function deleteBySessionId(db: Kysely<Database>, sessionId: string): Promise<void> {
  return db.deleteFrom('sessionProgressNotes').where('sessionId', '=', sessionId).execute().then(() => undefined);
}
