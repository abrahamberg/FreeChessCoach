import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface CourseAudioFile {
  textHash: string;
  objectKey: string;
  size: number;
}

/** Records a note's file; returns the object key it replaced, if any. */
export async function upsert(db: Kysely<Database>, courseId: string, textHash: string, objectKey: string, size: number): Promise<string | undefined> {
  const before = await db.selectFrom('courseAudio').select('objectKey').where('courseId', '=', courseId).where('textHash', '=', textHash).executeTakeFirst();
  await db
    .insertInto('courseAudio')
    .values({ courseId, textHash, objectKey, size })
    .onConflict((conflict) => conflict.columns(['courseId', 'textHash']).doUpdateSet({ objectKey, size, createdAt: new Date() }))
    .execute();
  return before && before.objectKey !== objectKey ? before.objectKey : undefined;
}

/** Each stored note text's file, for the public page, the per-course cap and "what's missing". */
export function files(db: Kysely<Database>, courseId: string): Promise<CourseAudioFile[]> {
  return db.selectFrom('courseAudio').select(['textHash', 'objectKey', 'size']).where('courseId', '=', courseId).execute();
}

/** Drops audio no note of the published copy uses any more; returns the object keys, so the bucket can be cleaned too. */
export async function keepOnly(db: Kysely<Database>, courseId: string, textHashes: string[]): Promise<string[]> {
  let query = db.deleteFrom('courseAudio').where('courseId', '=', courseId);
  if (textHashes.length) query = query.where('textHash', 'not in', textHashes);
  return (await query.returning('objectKey').execute()).map((row) => row.objectKey);
}
