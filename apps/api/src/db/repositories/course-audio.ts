import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface CourseAudio {
  mimeType: string;
  bytes: Buffer;
}

export async function upsert(db: Kysely<Database>, courseId: string, textHash: string, audio: CourseAudio): Promise<void> {
  await db
    .insertInto('courseAudio')
    .values({ courseId, textHash, mimeType: audio.mimeType, bytes: audio.bytes })
    .onConflict((conflict) => conflict.columns(['courseId', 'textHash']).doUpdateSet({ mimeType: audio.mimeType, bytes: audio.bytes, createdAt: new Date() }))
    .execute();
}

export async function find(db: Kysely<Database>, courseId: string, textHash: string): Promise<CourseAudio | undefined> {
  return db.selectFrom('courseAudio').select(['mimeType', 'bytes']).where('courseId', '=', courseId).where('textHash', '=', textHash).executeTakeFirst();
}

export interface CourseAudioFile {
  textHash: string;
  contentHash: string;
  mirroredHash: string | null;
}

/** Each stored note text's file: its content hash (the public URL) and what
 * the mirror holds for it. */
export function files(db: Kysely<Database>, courseId: string): Promise<CourseAudioFile[]> {
  return db.selectFrom('courseAudio').select(['textHash', 'contentHash', 'mirroredHash']).where('courseId', '=', courseId).execute();
}

export async function setMirrored(db: Kysely<Database>, courseId: string, textHash: string, mirroredHash: string | null): Promise<void> {
  await db.updateTable('courseAudio').set({ mirroredHash }).where('courseId', '=', courseId).where('textHash', '=', textHash).execute();
}

export async function findByContent(db: Kysely<Database>, courseId: string, contentHash: string): Promise<(CourseAudio & { textHash: string }) | undefined> {
  return db
    .selectFrom('courseAudio')
    .select(['mimeType', 'bytes', 'textHash'])
    .where('courseId', '=', courseId)
    .where('contentHash', '=', contentHash)
    .executeTakeFirst();
}

/** Each stored hash with its size, for the per-course cap and "what's missing". */
export async function sizes(db: Kysely<Database>, courseId: string): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom('courseAudio')
    .select(['textHash', (eb) => eb.fn<number>('octet_length', ['bytes']).as('size')])
    .where('courseId', '=', courseId)
    .execute();
  return new Map(rows.map((row) => [row.textHash, Number(row.size)]));
}

/** Drops audio no note of the published copy uses any more; returns what the
 * mirror held for the dropped rows, so it can be deleted there too. */
export async function keepOnly(db: Kysely<Database>, courseId: string, textHashes: string[]): Promise<string[]> {
  let query = db.deleteFrom('courseAudio').where('courseId', '=', courseId);
  if (textHashes.length) query = query.where('textHash', 'not in', textHashes);
  const dropped = await query.returning('mirroredHash').execute();
  return dropped.flatMap((row) => (row.mirroredHash ? [row.mirroredHash] : []));
}
