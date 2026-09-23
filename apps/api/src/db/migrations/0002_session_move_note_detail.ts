import { sql, type Kysely } from 'kysely';

/** session_move_notes.detail: a long-form summary of the most recently
 *  closed episode only (older rows are cleared when a newer episode closes,
 *  so at most one row per session has it). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE session_move_notes ADD COLUMN detail text`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE session_move_notes DROP COLUMN detail`.execute(db);
}
