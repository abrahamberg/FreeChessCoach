import { sql, type Kysely } from 'kysely';

/** Replaces the server-master-key provider rows with one passphrase-derived
 * encrypted JSON envelope. Existing rows are intentionally removed: they were
 * decryptable by a database dump plus the deployment secret and do not meet
 * the new unlock contract. Users must enter their setup again. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS user_llm_keys`.execute(db);
  await sql`
    CREATE TABLE user_llm_setups (
      user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      setup_ciphertext   bytea NOT NULL,
      setup_iv           bytea NOT NULL,
      setup_salt         bytea NOT NULL,
      created_at         timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS user_llm_setups`.execute(db);
}
