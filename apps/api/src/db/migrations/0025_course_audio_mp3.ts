import { sql, type Kysely } from 'kysely';

/** Note audio is MP3 now (docs/courses.md §8). Courses are unreleased test
 * data, so the WAV rows are dropped, not converted: each note counts as
 * missing audio and the next publish voices it again. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM course_audio WHERE mime_type <> 'audio/mpeg'`.execute(db);
}

export async function down(): Promise<void> {
  // Dropped audio cannot come back; the next publish makes it again.
}
