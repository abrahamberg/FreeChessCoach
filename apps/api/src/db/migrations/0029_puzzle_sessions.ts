import { sql, type Kysely } from 'kysely';

/**
 * docs/plan.md Phase 59, Task 59.4 — a coach-guided walkthrough of one
 * `puzzle_assignments` batch. Deliberately a PARALLEL pair to
 * `sessions`/`session_messages`, not a mode grafted onto them: see Phase
 * 59's "Why a parallel session table" note in docs/plan.md —
 * `sessions.gameId` is `NOT NULL` and `currentPly`/`subjectPly`/episodes all
 * key off a real game's plies, none of which a puzzle set has.
 *
 * `current_item_index` (0-based, into the assignment's own `items` array)
 * replaces `sessions.currentPly`/`subjectPly` — a puzzle session is linear,
 * one item at a time, with no flashback/subject-change concept, so one
 * counter is enough. No `mode` column (a puzzle session is never anything
 * else). `status` reuses `sessions.status`'s exact four values, including
 * `paused_no_credits`, since puzzle-session turns go through the same
 * credits-metered LLM call path as every other coach turn.
 *
 * `puzzle_session_messages` mirrors `session_messages` exactly (same
 * `bigserial` PK so `ORDER BY id ASC` is a reliable append-only replay
 * order, same `role`/`content` shape so the same `ChatMessage`
 * request/persist plumbing applies unchanged) with `item_index` standing in
 * for `ply`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE puzzle_sessions (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id      uuid NOT NULL REFERENCES puzzle_assignments(id),
      user_id            uuid NOT NULL REFERENCES users(id),
      status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused_no_credits','abandoned')),
      current_item_index int NOT NULL DEFAULT 0,
      started_at         timestamptz NOT NULL DEFAULT now(),
      ended_at           timestamptz
    )
  `.execute(db);
  await sql`CREATE INDEX puzzle_sessions_assignment ON puzzle_sessions(assignment_id)`.execute(db);
  await sql`CREATE INDEX puzzle_sessions_user ON puzzle_sessions(user_id, status)`.execute(db);

  await sql`
    CREATE TABLE puzzle_session_messages (
      id                bigserial PRIMARY KEY,
      puzzle_session_id uuid NOT NULL REFERENCES puzzle_sessions(id),
      role              text NOT NULL CHECK (role IN ('user','assistant','tool')),
      content           jsonb NOT NULL,
      item_index        int,
      created_at        timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX puzzle_session_messages_session ON puzzle_session_messages(puzzle_session_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE puzzle_session_messages`.execute(db);
  await sql`DROP INDEX IF EXISTS puzzle_sessions_user`.execute(db);
  await sql`DROP INDEX IF EXISTS puzzle_sessions_assignment`.execute(db);
  await sql`DROP TABLE puzzle_sessions`.execute(db);
}
