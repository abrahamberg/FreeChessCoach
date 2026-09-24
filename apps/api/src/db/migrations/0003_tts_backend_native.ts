import { sql, type Kysely } from 'kysely';

/** Adds 'native' (the device's built-in speechSynthesis voices — mobile
 *  browsers and desktop Chrome) to the allowed users.tts_backend values. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_tts_backend_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_tts_backend_check
      CHECK (tts_backend IN ('openai','browser','local','native'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE users SET tts_backend = 'browser' WHERE tts_backend = 'native'`.execute(db);
  await sql`ALTER TABLE users DROP CONSTRAINT users_tts_backend_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_tts_backend_check
      CHECK (tts_backend IN ('openai','browser','local'))
  `.execute(db);
}
