import { sql, type Kysely } from 'kysely';

/** Guided first-run setup: null means the user has not finished (or skipped)
 * the welcome flow yet. Everyone who already has an account is stamped now,
 * so only genuinely new signups are sent through it. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN onboarded_at timestamptz`.execute(db);
  await sql`UPDATE users SET onboarded_at = now()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN onboarded_at`.execute(db);
}
