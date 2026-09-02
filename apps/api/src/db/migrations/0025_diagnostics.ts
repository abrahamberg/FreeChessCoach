import { sql, type Kysely } from 'kysely';

/**
 * docs/plan.md Phase 56 — persistence for the pure diagnostic primitives
 * built in Phases 52-55 (catalog, detectors, episode resolution, stats,
 * focus selection), none of which touch the DB themselves.
 *
 * `diagnostic_observations` is one row per surviving episode/opportunity
 * (`DiagnosticEntry`, packages/chess-analysis/src/diagnostics/
 * diagnostic-entry.ts) — `code`/`direction`/`failed`/`hwdl`/`severity`/
 * `reachability` mirror that interface directly. `code` is left as
 * unconstrained `text`, same convention as `findings.category`: the
 * catalog has 410 entries and is validated at the app layer (zod +
 * closed-enum check, AGENTS.md rule 8), not via a DB CHECK that would need
 * editing every time the catalog grows. `direction` and `severity` are
 * small, stable vocabularies (§I.1's four directions, §III.3's four bands)
 * so they get CHECK constraints, matching `analyses.status`/
 * `findings.severity`'s existing convention for small enums. `detail`
 * holds the rest of `DiagnosticEntry`'s context (opening, phase, clock,
 * complexity, opponent rating) that has no dedicated column — read-only
 * drill-down payload for the Task 58.1 evidence endpoint, never queried on.
 * No `ON DELETE CASCADE`: every existing user/game-scoped table in this
 * schema (`analyses`, `findings`, `game_move_qualities`) relies on the app
 * layer to cascade deletes explicitly (see `analysesRepo.deleteByGameId`),
 * and Task 56.2 wires `deleteByGameId` into that same existing path rather
 * than introducing the first DB-level cascade.
 *
 * `diagnostic_profiles` stores one `buildDiagnosticProfile` result
 * (Task 55.3) per user/time-control/window — `UNIQUE (user_id,
 * time_control, window_end)` is what makes windows addressable so
 * `historyStatus` (§III.1) can diff a new window against its immediate
 * predecessor by looking up the previous `window_end`. Pooled by exact
 * `time_control` text, never the coarser `speed` column, per this plan's
 * own "Pool by exact time control" standing constraint.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE diagnostic_observations (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      uuid NOT NULL REFERENCES users(id),
      game_id      uuid NOT NULL REFERENCES games(id),
      ply          int NOT NULL,
      code         text NOT NULL,
      direction    text NOT NULL CHECK (direction IN ('O','D','B','N')),
      failed       boolean NOT NULL,
      hwdl         double precision NOT NULL,
      severity     text NOT NULL CHECK (severity IN ('minor','meaningful','major','decisive')),
      reachability double precision NOT NULL,
      detail       jsonb,
      created_at   timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX diagnostic_observations_user_code ON diagnostic_observations(user_id, code, created_at)`.execute(db);
  await sql`CREATE INDEX diagnostic_observations_game ON diagnostic_observations(game_id)`.execute(db);

  await sql`
    CREATE TABLE diagnostic_profiles (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      uuid NOT NULL REFERENCES users(id),
      time_control text NOT NULL,
      window_start timestamptz NOT NULL,
      window_end   timestamptz NOT NULL,
      computed_at  timestamptz NOT NULL DEFAULT now(),
      profile      jsonb NOT NULL,
      UNIQUE (user_id, time_control, window_end)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE diagnostic_profiles`.execute(db);
  await sql`DROP INDEX IF EXISTS diagnostic_observations_game`.execute(db);
  await sql`DROP INDEX IF EXISTS diagnostic_observations_user_code`.execute(db);
  await sql`DROP TABLE diagnostic_observations`.execute(db);
}
