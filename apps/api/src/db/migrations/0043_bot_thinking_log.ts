import { sql, type Kysely } from 'kysely';

/**
 * The bot Thinking log becomes opt-in: each play_bot session records its
 * bot-move traces (bot-thinking-registry.ts) only while
 * `bot_thinking_log` is true, so the default session does no trace
 * bookkeeping at all. Toggled from the bot session's header overflow menu
 * (POST /api/sessions/:id/bot-thinking-log).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions ADD COLUMN bot_thinking_log boolean NOT NULL DEFAULT false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions DROP COLUMN bot_thinking_log`.execute(db);
}
