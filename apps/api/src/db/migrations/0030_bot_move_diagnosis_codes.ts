import { sql, type Kysely } from 'kysely';

/** Persists the real per-move diagnosis codes a bot's own move was found to
 * exhibit (docs/plan.md Phase 62 Task 62.4) on play mode's live
 * game_move_qualities rows — the canonical tag, computed from the same
 * classifyLiveMove result `reasons`/`quality` already are (0017_move_reasons.ts),
 * run through the diagnostics registry (families BV, MS, TA) rather than the
 * cheap per-candidate proxy `pickBotMove` used to steer selection
 * (bot-move-pick.ts). Defaults existing rows to an empty array, same as
 * 0017 did for `reasons`: cheap to regenerate, no batch job revisits old
 * rows, and an empty array degrades gracefully as "nothing detected" rather
 * than "not computed yet". Player/coach moves also get this column but
 * always store `[]` — see play-move-quality.ts's `computeDiagnosisCodes`
 * option — since real players already have a fuller, cross-ply-aware
 * diagnosis pipeline (the batch job, Phase 53+) and this live path would
 * only ever see a strictly weaker, single-ply signal for them. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE game_move_qualities ADD COLUMN diagnosis_codes jsonb NOT NULL DEFAULT '[]'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE game_move_qualities DROP COLUMN diagnosis_codes`.execute(db);
}
