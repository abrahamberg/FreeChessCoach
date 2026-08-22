import { sql, type Kysely } from 'kysely';

/** Stores the assembled §9 GameReport (accuracy, phase/opening/tactics/
 * strategy/endgame scores, classification counts, estimated rating). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses ADD COLUMN game_report jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses DROP COLUMN game_report`.execute(db);
}
