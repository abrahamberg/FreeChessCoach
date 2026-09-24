import { sql, type Kysely } from 'kysely';

/** Latest coach turn's literal LLM request/response for a practice session,
 * same shape and role as sessions.debug_snapshot (the "Debug last answer"
 * menu item). Overwritten every turn. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE puzzle_sessions ADD COLUMN debug_snapshot jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE puzzle_sessions DROP COLUMN debug_snapshot`.execute(db);
}
