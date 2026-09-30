import { sql, type Kysely } from 'kysely';

/** docs/courses.md §9: learners fetch note audio by a hash of its bytes, so
 * the URL changes whenever the audio does and a CDN (Cloudflare) can cache
 * it for good. Computed by Postgres, so no row can disagree with its bytes. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE course_audio
      ADD COLUMN content_hash text GENERATED ALWAYS AS (substr(encode(sha256(bytes), 'hex'), 1, 32)) STORED
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE course_audio DROP COLUMN IF EXISTS content_hash`.execute(db);
}
