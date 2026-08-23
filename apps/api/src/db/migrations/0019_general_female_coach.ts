import { sql, type Kysely } from 'kysely';

/**
 * Adds 'general_female' to the coach_persona CHECK constraint: a second
 * default-coach option, byte-identical in prompt text to 'general'
 * (packages/prompts/src/coach-persona.ts) — it differs only in which TTS
 * voice reads the coach's replies (COACH_PERSONA_INFO.voiceProfile), never
 * in chess judgment, tone, or method. Existing users keep 'general' and are
 * unaffected.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_coach_persona_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_coach_persona_check
      CHECK (coach_persona IN ('general','general_female','commander','scholar','huntress','shark','sunzi','gambler'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_coach_persona_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_coach_persona_check
      CHECK (coach_persona IN ('general','commander','scholar','huntress','shark','sunzi','gambler'))
  `.execute(db);
}
