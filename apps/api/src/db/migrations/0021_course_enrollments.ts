import { sql, type Kysely } from 'kysely';

/** docs/courses.md §11: a signed-in learner's course, with the stage they
 * are on, their place in it and the stages finished, so they can leave and
 * come back (the Games page's Continue rail, the Courses page). Separate from
 * `course_progress`, which is the review schedule per position + move. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE course_enrollments (
      user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      stage        text NOT NULL,
      place        jsonb NOT NULL DEFAULT '{}'::jsonb,
      stages_done  text[] NOT NULL DEFAULT '{}',
      started_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      PRIMARY KEY (user_id, course_id)
    )
  `.execute(db);
  await sql`CREATE INDEX course_enrollments_recent ON course_enrollments (user_id, updated_at DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS course_enrollments`.execute(db);
}
