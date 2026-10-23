import { sql, type Kysely } from 'kysely';

/** docs/courses.md §3: `reading` is a new kind. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP CONSTRAINT courses_kind_check`.execute(db);
  await sql`ALTER TABLE courses ADD CONSTRAINT courses_kind_check CHECK (kind IN ('trap', 'opening', 'tactics', 'puzzle', 'master_game', 'endgame', 'lesson', 'reading'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP CONSTRAINT courses_kind_check`.execute(db);
  await sql`DELETE FROM courses WHERE kind = 'reading'`.execute(db);
  await sql`ALTER TABLE courses ADD CONSTRAINT courses_kind_check CHECK (kind IN ('trap', 'opening', 'tactics', 'puzzle', 'master_game', 'endgame', 'lesson'))`.execute(db);
}
