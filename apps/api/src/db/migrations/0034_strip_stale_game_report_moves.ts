import { sql, type Kysely } from 'kysely';

/**
 * 0032_annotated_pgn.ts split `moves` out of what `analyses.game_report`
 * stores (it's `games.annotated_pgn`'s data now, not duplicated onto the
 * report), but only for games analyzed *after* that migration — a row
 * written before it still physically carries its old, full-shaped
 * `GameReport` JSON, `moves` array included. Nothing reads that leftover
 * `moves` (the read path composes it fresh from `annotated_pgn`, which is
 * null for these pre-migration games — no backfill, per that migration's
 * own decision), so it's dead weight sitting in the widest column on the
 * busiest table: exactly the kind of bloat 0032 set out to remove. This
 * strips it, in place, leaving the still-valid aggregate fields (accuracy/
 * scores/counts/tacticMotifs/etc.) untouched — a row that already has no
 * `moves` key (every game analyzed after 0032) is a no-op for `?`/`-`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE analyses
    SET game_report = game_report - 'moves'
    WHERE game_report IS NOT NULL AND game_report ? 'moves'
  `.execute(db);
}

/**
 * Irreversible: the stripped `moves` arrays are gone, with nothing left to
 * reconstruct them from (0032_annotated_pgn.ts's own `down` is the same
 * kind of one-way data loss for the columns/table it drops). Down is a
 * no-op rather than an error, consistent with that precedent.
 */
export async function down(): Promise<void> {}
