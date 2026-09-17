import { sql, type Kysely } from 'kysely';

/**
 * Task 64.2 — persists `selectFocus`'s primary/secondary split, which was
 * previously recomputed fresh on every `rebuild-diagnostic-profile` run and
 * never written anywhere, so a focus area's rank could silently flip with
 * no signal to the student. "At most one primary per user" is enforced
 * app-level (`progress.ts`'s `promoteToPrimary`), the same way the
 * max-3-active cap already is — a user's active set changes one row at a
 * time, so a DB constraint would need a partial unique index for no benefit
 * a service-layer check doesn't already give.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE focus_areas ADD COLUMN is_primary boolean NOT NULL DEFAULT false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE focus_areas DROP COLUMN is_primary`.execute(db);
}
