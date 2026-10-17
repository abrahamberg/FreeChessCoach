import { sql, type Kysely } from 'kysely';

/** Adds 'witch' (Vesper the Witch) to the coach_persona CHECK constraint.
 * Existing users keep their coach and are unaffected. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_coach_persona_check`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_coach_persona_check
      CHECK (coach_persona IN ('general','general_female','commander','scholar','huntress','shark','sunzi','gambler','witch'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_coach_persona_check`.execute(db);
  await sql`UPDATE users SET coach_persona = 'general_female' WHERE coach_persona = 'witch'`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_coach_persona_check
      CHECK (coach_persona IN ('general','general_female','commander','scholar','huntress','shark','sunzi','gambler'))
  `.execute(db);
}
