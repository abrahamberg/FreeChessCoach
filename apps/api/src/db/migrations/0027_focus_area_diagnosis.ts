import { sql, type Kysely } from 'kysely';

/**
 * Task 57.3 — focus areas move from category-level to code-level targeting.
 * `diagnosis_code` is nullable so existing category-only rows (created
 * before this task) stay valid without a backfill; every new row going
 * forward is created by `progress.ts`'s `syncProgrammaticFocusAreas` (Task
 * 55.4's `selectFocus`, not the LLM) and always sets it. Unconstrained
 * `text`, same reasoning as `diagnostic_observations.code`/
 * `findings.diagnosis_code` — the 410-entry catalog is validated at the app
 * layer, not via a DB CHECK.
 *
 * `UNIQUE (user_id, category)` is dropped: a student can now hold several
 * active focus areas that share one broad category (e.g. two different
 * tactical-motif codes), which the old constraint would have rejected.
 * `UNIQUE (user_id, diagnosis_code)` replaces it as the new one-area-per-
 * skill invariant. Postgres treats NULLs as distinct for uniqueness
 * purposes, so multiple legacy category-only rows (`diagnosis_code IS
 * NULL`) can coexist under the new constraint without a conflict.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE focus_areas ADD COLUMN diagnosis_code text NULL`.execute(db);
  await sql`ALTER TABLE focus_areas DROP CONSTRAINT focus_areas_user_id_category_key`.execute(db);
  await sql`ALTER TABLE focus_areas ADD CONSTRAINT focus_areas_user_id_diagnosis_code_key UNIQUE (user_id, diagnosis_code)`.execute(
    db
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE focus_areas DROP CONSTRAINT focus_areas_user_id_diagnosis_code_key`.execute(db);
  await sql`ALTER TABLE focus_areas ADD CONSTRAINT focus_areas_user_id_category_key UNIQUE (user_id, category)`.execute(db);
  await sql`ALTER TABLE focus_areas DROP COLUMN diagnosis_code`.execute(db);
}
