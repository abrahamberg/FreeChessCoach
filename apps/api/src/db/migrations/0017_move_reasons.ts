import { sql, type Kysely } from 'kysely';

/** Persists classify.ts's deterministic per-move `reasons` (§11) on play
 * mode's live game_move_qualities rows, matching what the batch pipeline's
 * analyses.classified_moves already carries — needed so the live coach
 * context (episode-context.ts) can surface the same "why" text in both
 * modes. Defaults existing rows to an empty array rather than backfilling:
 * reasons is cheap to regenerate (classifyLiveMove already computes it) but
 * there's no batch job that revisits old play-mode moves, and an empty
 * array degrades gracefully (renderAnnotatedMove/renderAnalysisSection both
 * treat it the same as "no reasons"). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE game_move_qualities ADD COLUMN reasons jsonb NOT NULL DEFAULT '[]'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE game_move_qualities DROP COLUMN reasons`.execute(db);
}
