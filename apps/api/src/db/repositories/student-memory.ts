import type { Kysely } from 'kysely';
import { ValidationError } from '../../lib/errors.js';
import type { Database } from '../schema.js';

/** One general text per student, rewritten whole — the coach's long-term view
 * of how this student thinks and what teaches them best. */
export const MAX_STUDENT_MEMORY_CHARS = 1500;

export interface StudentMemoryRow {
  userId: string;
  content: string;
  updatedAt: Date;
}

export function findByUserId(db: Kysely<Database>, userId: string): Promise<StudentMemoryRow | undefined> {
  return db.selectFrom('studentMemory').selectAll().where('userId', '=', userId).executeTakeFirst();
}

/** The length is checked here, not left to the model: a memory that grows
 * every session would eat the prompt. */
export function upsert(db: Kysely<Database>, userId: string, content: string): Promise<StudentMemoryRow> {
  if (content.length > MAX_STUDENT_MEMORY_CHARS) {
    throw new ValidationError(`student memory is ${content.length} characters; the limit is ${MAX_STUDENT_MEMORY_CHARS}`);
  }
  return db
    .insertInto('studentMemory')
    .values({ userId, content })
    .onConflict((oc) => oc.column('userId').doUpdateSet({ content, updatedAt: new Date() }))
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** services/account.ts's deletion cascade. */
export function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  return db.deleteFrom('studentMemory').where('userId', '=', userId).execute().then(() => undefined);
}
