import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface NewBugReport {
  userId: string;
  whatHappened: string;
  whatExpected: string;
  pagePath: string | null;
  userAgent: string | null;
}

export async function insert(db: Kysely<Database>, values: NewBugReport): Promise<string> {
  const row = await db.insertInto('bugReports').values(values).returning('id').executeTakeFirstOrThrow();
  return row.id;
}

export async function countSince(db: Kysely<Database>, userId: string, since: Date): Promise<number> {
  const result = await db
    .selectFrom('bugReports')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('userId', '=', userId)
    .where('createdAt', '>=', since)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/** Account deletion only. */
export async function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  await db.deleteFrom('bugReports').where('userId', '=', userId).execute();
}
