import { sql, type Kysely } from 'kysely';

/** Stores the opening-book walk and named opening resolved during batch analysis. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses ADD COLUMN book_report jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE analyses DROP COLUMN book_report`.execute(db);
}
