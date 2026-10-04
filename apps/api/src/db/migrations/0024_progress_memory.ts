import { sql, type Kysely } from 'kysely';

/** Phase 128: the coach's progress memory. `resolved` becomes `graduated`
 * (the improved list, with a date), a student keeps one general memory text,
 * a session keeps a lesson note and a phase, and every message says which
 * round it belongs to. Existing focus-area notes were written from one move
 * and are reset to the measured note, which the next rebuild rewrites. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE focus_areas DROP CONSTRAINT focus_areas_status_check`.execute(db);
  await sql`UPDATE focus_areas SET status = 'graduated' WHERE status = 'resolved'`.execute(db);
  await sql`ALTER TABLE focus_areas ADD CONSTRAINT focus_areas_status_check CHECK (status IN ('active','improving','graduated'))`.execute(db);
  await sql`ALTER TABLE focus_areas ADD COLUMN graduated_at timestamptz`.execute(db);
  await sql`UPDATE focus_areas SET graduated_at = last_seen_at WHERE status = 'graduated'`.execute(db);
  await sql`UPDATE focus_areas SET note = 'Selected automatically from measured play: awaiting the next measurement.'`.execute(db);

  await sql`
    CREATE TABLE student_memory (
      user_id    uuid PRIMARY KEY REFERENCES users(id),
      content    text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`ALTER TABLE sessions ADD COLUMN lesson_note text`.execute(db);
  await sql`ALTER TABLE sessions ADD COLUMN phase text NOT NULL DEFAULT 'review' CHECK (phase IN ('progress_open','review','progress_close'))`.execute(db);
  await sql`ALTER TABLE session_messages ADD COLUMN phase text NOT NULL DEFAULT 'review' CHECK (phase IN ('progress_open','review','progress_close'))`.execute(db);

  await sql`
    CREATE TABLE session_progress_notes (
      id             bigserial PRIMARY KEY,
      session_id     uuid NOT NULL REFERENCES sessions(id),
      diagnosis_code text,
      note           text NOT NULL,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX session_progress_notes_session ON session_progress_notes(session_id, id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE session_progress_notes`.execute(db);
  await sql`ALTER TABLE session_messages DROP COLUMN phase`.execute(db);
  await sql`ALTER TABLE sessions DROP COLUMN phase`.execute(db);
  await sql`ALTER TABLE sessions DROP COLUMN lesson_note`.execute(db);
  await sql`DROP TABLE student_memory`.execute(db);
  await sql`ALTER TABLE focus_areas DROP COLUMN graduated_at`.execute(db);
  await sql`ALTER TABLE focus_areas DROP CONSTRAINT focus_areas_status_check`.execute(db);
  await sql`UPDATE focus_areas SET status = 'improving' WHERE status = 'graduated'`.execute(db);
  await sql`ALTER TABLE focus_areas ADD CONSTRAINT focus_areas_status_check CHECK (status IN ('active','improving','resolved'))`.execute(db);
}
