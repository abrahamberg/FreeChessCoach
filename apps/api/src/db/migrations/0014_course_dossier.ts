import { sql, type Kysely } from 'kysely';

/** docs/courses.md §5.2: the engine dossier is kept with the course, so a
 * resumed generation job and a one-episode regeneration don't run the engine
 * again. It depends only on the tree and the learner side, which never change. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses ADD COLUMN dossier jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP COLUMN IF EXISTS dossier`.execute(db);
}
