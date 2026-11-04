import { sql, type Kysely } from 'kysely';

/** Courses belong to the platform, not to one user (docs/courses.md §2):
 * every course editor sees and edits every course. `created_by` is kept for
 * the record only, and an editor's account deletion no longer deletes their
 * courses. Editors make API tokens (`course_api_tokens`) so the studio can
 * work without a browser session; only the hash is stored.
 *
 * The app no longer writes courses with AI, and every import builds the
 * dossier, so the AI run's state (`generation`, `course_ai_calls`) and the
 * hand-rated moves (`evals`, 0031) go. A course that had only `evals` shows
 * no eval bar until the studio imports it again. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users RENAME COLUMN can_create_courses TO can_edit_courses`.execute(db);
  await sql`ALTER TABLE courses RENAME COLUMN owner_id TO created_by`.execute(db);
  await sql`ALTER TABLE courses ALTER COLUMN created_by DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE courses DROP CONSTRAINT courses_owner_id_fkey`.execute(db);
  await sql`ALTER TABLE courses ADD CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`.execute(db);
  await sql`DROP INDEX courses_owner_updated`.execute(db);
  await sql`CREATE INDEX courses_updated ON courses(updated_at DESC)`.execute(db);
  await sql`
    CREATE TABLE course_api_tokens (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
      token_hash    text NOT NULL UNIQUE,
      created_at    timestamptz NOT NULL DEFAULT now(),
      last_used_at  timestamptz,
      revoked_at    timestamptz
    )
  `.execute(db);
  await sql`CREATE INDEX course_api_tokens_user ON course_api_tokens(user_id)`.execute(db);
  await sql`DROP TABLE course_ai_calls`.execute(db);
  await sql`ALTER TABLE courses DROP COLUMN generation`.execute(db);
  await sql`ALTER TABLE courses DROP COLUMN evals`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses ADD COLUMN evals jsonb`.execute(db);
  await sql`ALTER TABLE courses ADD COLUMN generation jsonb`.execute(db);
  await sql`
    CREATE TABLE course_ai_calls (
      id         bigserial PRIMARY KEY,
      course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      entry      jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX course_ai_calls_course ON course_ai_calls(course_id, id)`.execute(db);
  await sql`DROP TABLE course_api_tokens`.execute(db);
  await sql`DROP INDEX courses_updated`.execute(db);
  await sql`DELETE FROM courses WHERE created_by IS NULL`.execute(db);
  await sql`ALTER TABLE courses DROP CONSTRAINT courses_created_by_fkey`.execute(db);
  await sql`ALTER TABLE courses ALTER COLUMN created_by SET NOT NULL`.execute(db);
  await sql`ALTER TABLE courses RENAME COLUMN created_by TO owner_id`.execute(db);
  await sql`ALTER TABLE courses ADD CONSTRAINT courses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)`.execute(db);
  await sql`CREATE INDEX courses_owner_updated ON courses(owner_id, updated_at DESC)`.execute(db);
  await sql`ALTER TABLE users RENAME COLUMN can_edit_courses TO can_create_courses`.execute(db);
}
