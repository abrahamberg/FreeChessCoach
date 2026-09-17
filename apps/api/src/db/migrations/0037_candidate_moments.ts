import { sql, type Kysely } from 'kysely';

/**
 * `findCandidateMoments` (packages/chess-analysis) is pure and cheap (no AI)
 * but needs the raw per-position evals' starting-position eval, which
 * analysis never persists (`analyzeInChunks` only increments a counter).
 * Storing the computed result here means the lazily-generated coaching plan
 * (services/coaching-plan.ts's `ensureCoachingPlan`) never needs raw evals
 * at all — it reads this column instead of reconstructing anything.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses ADD COLUMN candidate_moments jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses DROP COLUMN candidate_moments`.execute(db);
}
