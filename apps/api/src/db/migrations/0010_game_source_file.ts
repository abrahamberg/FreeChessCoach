import { sql, type Kysely } from 'kysely';

/** A game read from the student's own .pgn file is now source 'file' (was
 * 'upload' — nothing is uploaded, the browser reads the file and sends the
 * text). Rewrites existing rows and the CHECK constraint to match. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP CONSTRAINT games_source_check`.execute(db);
  await sql`UPDATE games SET source = 'file' WHERE source = 'upload'`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_source_check
      CHECK (source IN ('paste','file','lichess','coach_play','vs_bot','chesscom'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP CONSTRAINT games_source_check`.execute(db);
  await sql`UPDATE games SET source = 'upload' WHERE source = 'file'`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_source_check
      CHECK (source IN ('paste','upload','lichess','coach_play','vs_bot','chesscom'))
  `.execute(db);
}
