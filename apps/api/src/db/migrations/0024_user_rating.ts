import { sql, type Kysely } from 'kysely';

/**
 * docs/diagnose.md §0.1/§0.2's rating priors are all numeric Chess.com Rapid
 * intervals, but users only ever carried the coarse `rating_band` enum.
 * `rating`/`rating_source` add a real number (self-reported, read off a PGN's
 * Elo header, or §8.5-estimated) — `rating_band` stays the display/
 * prompt-calibration concept it already is, now derived from `rating` in
 * user-profile.ts's service layer when a number is known, rather than the
 * two being set independently.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN rating integer NULL`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN rating_source text NULL`.execute(db);
  await sql`
    ALTER TABLE users ADD CONSTRAINT users_rating_source_check
      CHECK (rating_source IN ('self','pgn','estimated'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP CONSTRAINT users_rating_source_check`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN rating_source`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN rating`.execute(db);
}
