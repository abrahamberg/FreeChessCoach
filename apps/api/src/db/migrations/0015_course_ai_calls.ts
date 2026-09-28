import { sql, type Kysely } from 'kysely';

/** docs/plan.md Task 80.6: one row per AI call of a course's runs
 * (CourseDebugCallSchema jsonb), for the creator's "Debug AI calls" view. A
 * table of its own so the editor's progress polling never loads it. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE course_ai_calls (
      id         bigserial PRIMARY KEY,
      course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      entry      jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX course_ai_calls_course ON course_ai_calls(course_id, id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS course_ai_calls`.execute(db);
}
