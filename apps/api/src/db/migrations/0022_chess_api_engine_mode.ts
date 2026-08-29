import { sql, type Kysely } from 'kysely';

/**
 * Adds 'chess_api' to the engine_mode CHECK constraint — the free
 * https://chess-api.com/v1 HTTP API, called server-side only (see
 * resolve-engine-backend.ts). The column's own DEFAULT stays 'native' on
 * purpose: it's a fallback for rows/fixtures that never go through the app's
 * user-creation path, not the product default. userProfileService.getOrCreate
 * sets 'chess_api' explicitly for every genuinely new user instead — see its
 * doc comment.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_engine_mode_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_engine_mode_check
      CHECK (engine_mode IN ('native','browser','chess_api'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_engine_mode_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_engine_mode_check
      CHECK (engine_mode IN ('native','browser'))
  `.execute(db);
}
