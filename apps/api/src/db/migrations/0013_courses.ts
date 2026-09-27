import { sql, type Kysely } from 'kysely';

/** docs/courses.md §4, §9. `document` is the creator's draft,
 * `published_document` the frozen copy learners see; both are
 * CourseDocumentSchema jsonb. `generation` holds the worker job's state. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE courses (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id           uuid NOT NULL REFERENCES users(id),
      slug               text NOT NULL UNIQUE,
      kind               text NOT NULL
        CHECK (kind IN ('opening_reel', 'opening_course', 'tactics', 'trap', 'master_game')),
      status             text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'unlisted', 'public', 'removed')),
      title              text NOT NULL,
      source_pgn         text NOT NULL,
      direction          text NOT NULL DEFAULT '',
      document           jsonb,
      published_document jsonb,
      published_at       timestamptz,
      generation         jsonb,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX courses_owner_updated ON courses(owner_id, updated_at DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS courses`.execute(db);
}
