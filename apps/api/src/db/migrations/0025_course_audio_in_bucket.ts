import { sql, type Kysely } from 'kysely';

/** docs/courses.md §8: note audio lives in the bucket, not in Postgres. A row
 * is now only where the file is (`object_key`) and its size, found by the
 * note text's hash. Courses are unreleased test data, so the old rows (the
 * bytes) are dropped, not moved: each note is voiced again on the next publish. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE course_audio`.execute(db);
  await sql`
    CREATE TABLE course_audio (
      course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      text_hash  text NOT NULL,
      object_key text NOT NULL,
      size       integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (course_id, text_hash)
    )
  `.execute(db);
}

export async function down(): Promise<void> {
  // The audio is in the bucket; the old table held the bytes. Not restorable.
}
