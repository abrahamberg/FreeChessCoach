import { sql, type Kysely } from 'kysely';

/**
 * Focused-session rework — a puzzle session now tracks progress *within*
 * the current item's solution line, not just which item it's on.
 * `current_ply` counts how many of `assignment.items[current_item_index].moves`
 * have been applied to the live position. It starts at 1 the moment an item
 * becomes current: `moves[0]` is always the opponent's forced Lichess-style
 * setup move (see puzzle-coach-system.ts), auto-applied with no student
 * decision involved, so ply 1 is the true "your move" starting point. The
 * student's next expected move is always `moves[current_ply]`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE puzzle_sessions ADD COLUMN current_ply int NOT NULL DEFAULT 1`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE puzzle_sessions DROP COLUMN current_ply`.execute(db);
}
