import { sql, type Kysely } from 'kysely';

/** docs/courses.md §9: members-only courses. A course at access level N is
 * for its owner and for users at level N or above; 0 is everyone. The
 * user's level is set by scripts/course-access.ts; no route writes it. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN course_access_level integer NOT NULL DEFAULT 0 CHECK (course_access_level >= 0)`.execute(db);
  await sql`ALTER TABLE courses ADD COLUMN access_level integer NOT NULL DEFAULT 0 CHECK (access_level >= 0)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP COLUMN access_level`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN course_access_level`.execute(db);
}
