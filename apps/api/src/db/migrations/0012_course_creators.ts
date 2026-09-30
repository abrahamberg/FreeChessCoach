import { sql, type Kysely } from 'kysely';

/** Only users a moderator enables may create courses (docs/courses.md §2).
 * Set by apps/api/scripts/course-creator.ts; no route writes it. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN can_create_courses boolean NOT NULL DEFAULT false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN can_create_courses`.execute(db);
}
