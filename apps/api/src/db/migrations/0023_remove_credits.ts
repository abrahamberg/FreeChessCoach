import { sql, type Kysely } from 'kysely';

/**
 * Removes the credit/ledger system. The app is now bring-your-own-key only:
 * users supply their own Anthropic/OpenAI API key (stored encrypted in
 * user_llm_keys), so the credit ledger, the Stripe-backed credit-pack
 * checkout, and the per-call credit metering on llm_call_log are all gone.
 *
 * - Drops the `credit_ledger` table (balance + Stripe purchase debits).
 * - Drops the `llm_call_log` table (its only remaining job after removing
 *   credit metering was an audit log; the per-turn debug snapshot lives on
 *   the `sessions` row instead).
 * - Migrates any `paused_no_credits` sessions to `abandoned` and drops that
 *   status value from the sessions.status CHECK (the app can no longer pause
 *   a session for lack of credits — without a platform key there's nothing to
 *   run out of).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE sessions SET status = 'abandoned' WHERE status = 'paused_no_credits'`.execute(db);
  await sql`ALTER TABLE sessions DROP CONSTRAINT sessions_status_check`.execute(db);
  await sql`
    ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
      CHECK (status IN ('active','completed','abandoned'))
  `.execute(db);
  await sql`DROP TABLE IF EXISTS llm_call_log`.execute(db);
  await sql`DROP TABLE IF EXISTS credit_ledger`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE credit_ledger (
      id              bigserial PRIMARY KEY,
      user_id         uuid NOT NULL REFERENCES users(id),
      delta           int NOT NULL,
      reason          text NOT NULL CHECK (reason IN
                        ('signup_grant','purchase','session_usage','refund')),
      session_id      uuid,
      stripe_event_id text UNIQUE,
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`
    CREATE TABLE llm_call_log (
      id                  bigserial PRIMARY KEY,
      user_id             uuid NOT NULL,
      session_id          uuid,
      provider            text NOT NULL,
      model               text NOT NULL,
      input_tokens        int NOT NULL,
      output_tokens       int NOT NULL,
      cached_input_tokens int NOT NULL DEFAULT 0,
      credits_metered     int NOT NULL DEFAULT 0,
      purpose             text NOT NULL,
      created_at          timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`ALTER TABLE sessions DROP CONSTRAINT sessions_status_check`.execute(db);
  await sql`
    ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
      CHECK (status IN ('active','completed','paused_no_credits','abandoned'))
  `.execute(db);
}
