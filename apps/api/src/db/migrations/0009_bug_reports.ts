import { sql, type Kysely } from 'kysely';

/** Bug reports sent from the app's menu. Tied to a user (for rate limiting and
 * for asking what they meant), and removed with the account. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE bug_reports (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL REFERENCES users(id),
      what_happened text NOT NULL,
      what_expected text NOT NULL,
      page_path     text,
      user_agent    text,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX bug_reports_user_created ON bug_reports(user_id, created_at)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS bug_reports`.execute(db);
}
