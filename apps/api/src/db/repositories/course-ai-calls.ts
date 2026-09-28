import { COURSE_DEBUG_MAX_CALLS, CourseDebugCallSchema, type CourseDebugCall } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

/** Appends one call and drops the oldest past COURSE_DEBUG_MAX_CALLS. */
export async function insert(db: Kysely<Database>, courseId: string, entry: CourseDebugCall): Promise<string> {
  const row = await db
    .insertInto('courseAiCalls')
    .values({ courseId, entry: JSON.stringify(CourseDebugCallSchema.parse(entry)) })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .deleteFrom('courseAiCalls')
    .where('courseId', '=', courseId)
    .where(
      'id',
      'not in',
      db.selectFrom('courseAiCalls').select('id').where('courseId', '=', courseId).orderBy('id', 'desc').limit(COURSE_DEBUG_MAX_CALLS)
    )
    .execute();
  return row.id;
}

export async function update(db: Kysely<Database>, id: string, entry: CourseDebugCall): Promise<void> {
  await db.updateTable('courseAiCalls').set({ entry: JSON.stringify(CourseDebugCallSchema.parse(entry)) }).where('id', '=', id).execute();
}

/** A fresh run starts a fresh log. */
export async function clear(db: Kysely<Database>, courseId: string): Promise<void> {
  await db.deleteFrom('courseAiCalls').where('courseId', '=', courseId).execute();
}

export async function listForCourse(db: Kysely<Database>, courseId: string): Promise<CourseDebugCall[]> {
  const rows = await db.selectFrom('courseAiCalls').select('entry').where('courseId', '=', courseId).orderBy('id').execute();
  return rows.map((row) => row.entry);
}
