import { sql, type Kysely } from 'kysely';

/**
 * Task 57.1 — `docs/diagnose.md` §5's verbal diagnostic sequence and §I.2's
 * failure-mechanism taxonomy, formalized onto `findings` so `record_finding`
 * can carry what the student *said*, not just a broad category. All three
 * columns are nullable: every existing row (and any future caller that
 * doesn't yet resolve a diagnosis code) stays valid without a backfill.
 * `mechanism`/`direction` are small, stable vocabularies (§I.2's ten
 * mechanisms, §I.1's four directions) so they get CHECK constraints, same
 * convention `0025_diagnostics.ts` used. `diagnosis_code` stays
 * unconstrained `text` — the 410-entry catalog is validated at the app
 * layer (`progress.ts`'s `assertValidDiagnosisCode`), not via a DB CHECK,
 * same reasoning as `diagnostic_observations.code`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE findings ADD COLUMN diagnosis_code text NULL`.execute(db);
  await sql`ALTER TABLE findings ADD COLUMN mechanism text NULL`.execute(db);
  await sql`ALTER TABLE findings ADD COLUMN direction text NULL`.execute(db);
  await sql`
    ALTER TABLE findings ADD CONSTRAINT findings_mechanism_check
      CHECK (mechanism IN ('K','M','V','R','G','C','J','X','L','S'))
  `.execute(db);
  await sql`
    ALTER TABLE findings ADD CONSTRAINT findings_direction_check
      CHECK (direction IN ('O','D','B','N'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE findings DROP CONSTRAINT findings_direction_check`.execute(db);
  await sql`ALTER TABLE findings DROP CONSTRAINT findings_mechanism_check`.execute(db);
  await sql`ALTER TABLE findings DROP COLUMN direction`.execute(db);
  await sql`ALTER TABLE findings DROP COLUMN mechanism`.execute(db);
  await sql`ALTER TABLE findings DROP COLUMN diagnosis_code`.execute(db);
}
