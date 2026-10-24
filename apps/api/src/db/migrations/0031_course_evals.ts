import { sql, type Kysely } from 'kysely';

/** A hand-made course keeps just its moves' evaluations and qualities (the
 * eval bar and move icons), not the whole dossier. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses ADD COLUMN evals jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP COLUMN IF EXISTS evals`.execute(db);
}
