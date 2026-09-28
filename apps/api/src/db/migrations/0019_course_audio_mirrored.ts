import { sql, type Kysely } from 'kysely';

/** docs/courses.md §9: the content hash of this row's file in the object
 * storage mirror (R2), null when it is not there. Differs from `content_hash`
 * after a re-voice, until the next publish copies the new file. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE course_audio ADD COLUMN mirrored_hash text`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE course_audio DROP COLUMN IF EXISTS mirrored_hash`.execute(db);
}
