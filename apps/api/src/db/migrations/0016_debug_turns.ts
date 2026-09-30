import { sql, type Kysely } from 'kysely';

/** The last few LLM turns of a coach or practice session, for "Debug last
 * answer" to step through (the course view's call picker, Task 80.6). The
 * session rows keep only the latest turn (`debug_snapshot`); a table of its
 * own so session reads never load the history. Exactly one owner per row. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE debug_turns (
      id                bigserial PRIMARY KEY,
      session_id        uuid REFERENCES sessions(id) ON DELETE CASCADE,
      puzzle_session_id uuid REFERENCES puzzle_sessions(id) ON DELETE CASCADE,
      snapshot          jsonb NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      CHECK ((session_id IS NULL) <> (puzzle_session_id IS NULL))
    )
  `.execute(db);
  await sql`CREATE INDEX debug_turns_session ON debug_turns(session_id, id) WHERE session_id IS NOT NULL`.execute(db);
  await sql`CREATE INDEX debug_turns_puzzle_session ON debug_turns(puzzle_session_id, id) WHERE puzzle_session_id IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS debug_turns`.execute(db);
}
