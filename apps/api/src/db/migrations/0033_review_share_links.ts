import { sql, type Kysely } from 'kysely';

/** A signed-in player can share one game's review by link (growth plan A6):
 * `share_token` is the link's secret, 128 random bits in base64url, set while
 * the link is on and null once the owner turns it off. A new link after that
 * gets a new token, so an old link never comes back. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games ADD COLUMN share_token text UNIQUE CHECK (share_token ~ '^[A-Za-z0-9_-]{22}$')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP COLUMN share_token`.execute(db);
}
