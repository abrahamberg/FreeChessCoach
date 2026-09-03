import { sql, type Kysely } from 'kysely';

/**
 * docs/plan.md Phase 59, Task 59.2 — a batch of Lichess puzzles a background
 * job (Task 59.3) hands a student for one diagnosed weakness. `items` is a
 * *snapshot* of the `PuzzleRecord[]` `selectPuzzles` returned at assignment
 * time (packages/chess-analysis/src/puzzle-selection.ts), each widened with
 * a per-item `result` — never a list of puzzle IDs re-resolved against the
 * pool at read time, so a later pool rebuild (Task 59.1) can never shift an
 * assignment a student is partway through. `diagnosis_code` is
 * unconstrained `text`, same convention as `diagnostic_observations.code`/
 * `findings.diagnosis_code` (0025_diagnostics.ts) — the catalog is validated
 * at the app layer, not a DB CHECK. `reason` is rendered label text, frozen
 * at creation so a later catalog label edit doesn't rewrite an old card's
 * copy.
 *
 * One open (`pending`/`in_progress`) assignment per `(user_id,
 * diagnosis_code)` is an app-layer invariant (the creating job checks
 * before inserting), not a DB constraint — same
 * checked-in-code-not-in-schema discipline as `diagnostic_observations`
 * (Task 56.1) and `focus_areas`' status handling, since "open" depends on
 * `status`, not a plain uniqueness rule a partial index could express any
 * more simply than the app check already does.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE puzzle_assignments (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        uuid NOT NULL REFERENCES users(id),
      diagnosis_code text NOT NULL,
      reason         text NOT NULL,
      items          jsonb NOT NULL,
      status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
      created_at     timestamptz NOT NULL DEFAULT now(),
      started_at     timestamptz,
      completed_at   timestamptz
    )
  `.execute(db);
  await sql`CREATE INDEX puzzle_assignments_user_status ON puzzle_assignments(user_id, status)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS puzzle_assignments_user_status`.execute(db);
  await sql`DROP TABLE puzzle_assignments`.execute(db);
}
