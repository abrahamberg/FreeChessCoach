import { sql, type Kysely } from 'kysely';

/** When chess-api.com last answered HIGH_USAGE for this user's connection;
 * the external engine is skipped for CHESS_API_RATE_LIMIT_COOLDOWN_MS after. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN chess_api_rate_limited_at timestamptz`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN chess_api_rate_limited_at`.execute(db);
}
