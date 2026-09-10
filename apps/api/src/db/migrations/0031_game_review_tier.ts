import { sql, type Kysely } from 'kysely';

/**
 * Backs the Games page's four tabs (Coach/Review/Bot games/Imported games,
 * see packages/shared's GAME_REVIEW_TIERS) and the "promote up the stack"
 * action. Every new row computes this itself in the games repository's
 * `insert` (defaultReviewTierForSource) — the backfill here only covers
 * rows that already existed before this migration ran.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games ADD COLUMN review_tier text NOT NULL DEFAULT 'imported'`.execute(db);
  await sql`UPDATE games SET review_tier = 'bot' WHERE source = 'vs_bot'`.execute(db);
  await sql`UPDATE games SET review_tier = 'coach' WHERE source = 'coach_play'`.execute(db);
  await sql`
    ALTER TABLE games ADD CONSTRAINT games_review_tier_check
      CHECK (review_tier IN ('imported','bot','review','coach'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games DROP CONSTRAINT games_review_tier_check`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN review_tier`.execute(db);
}
