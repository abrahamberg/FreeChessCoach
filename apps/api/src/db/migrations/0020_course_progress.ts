import { sql, type Kysely } from 'kysely';

/** docs/courses.md §11: a signed-in learner's review schedule, one row per
 * position + move (`drill_key`: the normalised FEN key and the UCI move), so
 * a republished course keeps everyone's history. `course_slug` is only the
 * course last drilled from, for the "Due today" link. `due_on` is the
 * learner's own calendar day; null once mastered. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE course_progress (
      user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drill_key   text NOT NULL,
      san         text NOT NULL,
      course_slug text NOT NULL,
      step        smallint NOT NULL,
      due_on      date,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, drill_key)
    )
  `.execute(db);
  await sql`CREATE INDEX course_progress_due ON course_progress (user_id, due_on) WHERE due_on IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS course_progress`.execute(db);
}
