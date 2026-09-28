import { sql, type Kysely } from 'kysely';

/** docs/courses.md §13.2 (Phase 92): `opening_reel` and `opening_course`
 * become one `opening` kind, and `puzzle` is new. Course rows are test data;
 * existing opening rows become `opening`. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP CONSTRAINT courses_kind_check`.execute(db);
  await sql`
    UPDATE courses SET
      kind = 'opening',
      document = CASE WHEN document IS NULL THEN NULL ELSE jsonb_set(document, '{kind}', '"opening"') END,
      published_document = CASE WHEN published_document IS NULL THEN NULL ELSE jsonb_set(published_document, '{kind}', '"opening"') END
    WHERE kind IN ('opening_reel', 'opening_course')
  `.execute(db);
  await sql`ALTER TABLE courses ADD CONSTRAINT courses_kind_check CHECK (kind IN ('trap', 'opening', 'tactics', 'puzzle', 'master_game'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE courses DROP CONSTRAINT courses_kind_check`.execute(db);
  await sql`UPDATE courses SET kind = 'opening_course' WHERE kind = 'opening'`.execute(db);
  await sql`DELETE FROM courses WHERE kind = 'puzzle'`.execute(db);
  await sql`ALTER TABLE courses ADD CONSTRAINT courses_kind_check CHECK (kind IN ('opening_reel', 'opening_course', 'tactics', 'trap', 'master_game'))`.execute(db);
}
