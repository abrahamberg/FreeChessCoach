import { sql, type Kysely } from 'kysely';

/**
 * Adds 'paused' to analyses.status's CHECK constraint (0001_initial.ts) —
 * jobs/analyze-game.ts now uses it for an engine failure caused by the
 * user's browser tunnel not being connected (EngineUnavailableError), which
 * is retryable once they reconnect, rather than a permanent 'failed'.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses DROP CONSTRAINT analyses_status_check`.execute(db);
  await sql`ALTER TABLE analyses ADD CONSTRAINT analyses_status_check
    CHECK (status IN ('queued','engine_running','planning','ready','failed','paused'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE analyses SET status = 'failed' WHERE status = 'paused'`.execute(db);
  await sql`ALTER TABLE analyses DROP CONSTRAINT analyses_status_check`.execute(db);
  await sql`ALTER TABLE analyses ADD CONSTRAINT analyses_status_check
    CHECK (status IN ('queued','engine_running','planning','ready','failed'))`.execute(db);
}
