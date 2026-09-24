import { sql, type Kysely } from 'kysely';

/** Task 77.1: a game's `EngineEval[]`, stored after every analysed chunk so a
 * resumed or repeated analysis reuses them instead of asking the engine again
 * (services/analysis-chunks.ts). Null until the first chunk lands. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses ADD COLUMN engine_evals jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses DROP COLUMN engine_evals`.execute(db);
}
