import { sql, type Kysely } from 'kysely';

/** docs/courses.md §8: each course note's audio, made in the creator's
 * browser with the coach's voice and uploaded for the public board, so every
 * visitor hears the same voice. Keyed by the note text's hash: a changed note
 * needs new audio, an identical one shares it. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE course_audio (
      course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      text_hash  text NOT NULL,
      mime_type  text NOT NULL,
      bytes      bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (course_id, text_hash)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS course_audio`.execute(db);
}
