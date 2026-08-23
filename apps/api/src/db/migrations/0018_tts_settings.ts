import { sql, type Kysely } from 'kysely';

/**
 * Coach voice (TTS): a master on/off switch, default OFF, plus which backend
 * to use once it's on. 'openai' (default once enabled) calls the cloud API
 * and spends credits; 'browser' runs Kokoro WASM locally for free but is
 * slow and machine-dependent. Existing users get tts_enabled=false, so
 * nothing changes for anyone until they opt in via Settings.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE users ADD COLUMN tts_enabled boolean NOT NULL DEFAULT false
  `.execute(db);
  await sql`
    ALTER TABLE users ADD COLUMN tts_backend text NOT NULL DEFAULT 'openai'
      CHECK (tts_backend IN ('openai','browser'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN tts_backend`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN tts_enabled`.execute(db);
}
