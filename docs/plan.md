# FreeChessCoach — Import Limits, Stat Archive & Guided Import Implementation Plan

**Source spec:** the product request below (there is no separate spec file).
This plan is self-contained; every file/line reference in it was checked
against the code, not assumed. `docs/diagnose.md` and `docs/algorith.md` are
**irrelevant** here — do not open them. The previous plan (Phases 50–66,
programmatic coach diagnostics) is fully shipped and was removed from this
file; it lives in `git log -- docs/plan.md`.

## The request, as decided

1. **Import quotas.** 30 games per day, 150 per week, counted as *imports
   made* — **deleting a game never frees quota.** At most 10 games may be
   "in flight" (imported but analysis not finished) at once; analysis only
   finishes while the user's browser tab is connected (already how it works,
   see below).
2. **Library cap.** A user holds at most 1000 imported games. An import that
   would exceed that automatically deletes the 50 earliest games first, and
   the user is **told before importing** (single-game imports included).
3. **Stats survive deletion.** Deleting a game (manually, via "delete
   earliest", or by the auto-delete above) folds its stats into a compact
   **per-week** archive that the Stats page (and the tactic baseline) merge
   back in, so reports don't shrink and the DB doesn't keep every game.
4. **After a batch import**, once analysis completes, pick the game with the
   most tactical points as the *recommended coaching game* — programmatic,
   no AI.
5. **Single-game import** shows two buttons — **Analyze** (go to the game
   review) and **Get coaching session** — and when analysis completes the
   user lands directly in the one they chose.

## Scope decisions already taken (do not relitigate)

1. **Windows are rolling**, matching today's rolling-24h behaviour
   (`game-import.ts:172-176`): daily = last 24h, weekly = last 7×24h. Not
   calendar days/weeks.
2. **Quota is counted from a new append-only ledger** (`game_import_events`),
   one row per *new* successful import, with **no foreign key to `games`** so
   deleting a game cannot touch it. A dedup hit (same PGN re-imported) is not
   a new import and writes nothing — same as today, where the dedup return at
   `game-import.ts:76-77` happens before the limit check at `:79`.
3. **"1000 games" and "50 earliest" both mean *imported-source* games**
   (`ImportableGameSourceSchema.options` = paste/upload/lichess/chesscom),
   ordered by `createdAt` — exactly what the existing
   `gamesRepo.listEarliestImportedIds` (`repositories/games.ts:339-350`)
   selects. Bot and coach-play games are never counted or auto-deleted.
4. **The 10-in-flight cap counts `analyses.status IN ('queued',
   'engine_running','planning','paused')`.** `paused` counts on purpose: it
   is the state a game sits in while the browser tunnel is disconnected
   (`repositories/analyses.ts:270-282`), i.e. exactly "analysis not
   completed because the user isn't connected". `failed` and `ready` do not
   count.
5. **Archive granularity: (user, ISO week start — Monday 00:00 UTC, speed)**,
   holding *mergeable sufficient statistics* (sums + counts), not per-game
   rows and not pre-computed means — means of means would be wrong.
6. **Only games that already appear in the dashboard are archived**: imported
   source, `analyses.status = 'ready'`, report passes `StoredGameReportSchema`
   (mirrors `listReadyReportsForUser`, `repositories/analyses.ts:329-359`, and
   `toStatsEntry`, `services/stats-dashboard.ts:59-69`). Anything else is
   simply deleted, as today.
7. **Account deletion does *not* archive** — it wipes the archive too.
8. **Games deleted before this ships are not recoverable** — no archive can
   be reconstructed for them. State this in the final commit message.
9. **Limits are constants in `packages/shared`** (precedent:
   `MAX_DELETE_EARLIEST_IMPORTED`, `shared/src/game.ts:197`), shared with the
   web UI so copy never says "10/day" while the server says 30.

## What already exists and is reused as-is (verified in code, not assumed)

- **The current limit is one hard-coded constant and a rolling count.**
  `DAILY_IMPORT_LIMIT = 10` at `apps/api/src/services/game-import.ts:26`;
  `getDailyImportUsage` (`:172`) and `assertUnderDailyLimit` (`:178`) share
  one query, `gamesRepo.countImportsSince` (`repositories/games.ts:403-415`).
- **Bug this plan fixes as a side effect:** `countImportsSince` filters only
  `userId` and `createdAt` — no `source` filter — so `coach_play`/`vs_bot`
  games (also rows in `games`) consume import quota, and **deleting a game
  reopens quota**, both contrary to the request. The ledger removes both.
- **"Delete earliest 50" already exists end to end**:
  `POST /api/games/imported/delete-earliest` (`routes/games.ts:71-77`) →
  `deleteEarliestImportedGames` (`services/games.ts:66-76`, one transaction)
  → `listEarliestImportedIds`; shared
  `MAX_DELETE_EARLIEST_IMPORTED = 50` and its schemas
  (`shared/src/game.ts:194-204`); UI in `FindGamesPage.tsx`. The auto-delete
  reuses this service function; it does not get a second implementation.
- **All delete paths funnel through `cascadeDeleteGame`**
  (`services/games.ts:87`): `deleteGameForUser` (`:103`),
  `deleteEarliestImportedGames` (`:66`), and account deletion
  (`services/account.ts:26`). That is the single seam for archiving.
- **Stats are computed live, from stored per-game reports only**:
  `getStatsDashboard` (`services/stats-dashboard.ts:27`) →
  `listReadyReportsForUser` → `StatsEntry[]` → pure
  `buildStatsDashboard` (`chess-analysis/src/build-stats-dashboard.ts`, which
  composes `aggregateOpeningStats`, `aggregateRatingStats` and the local
  tactics/strategy/endgame aggregators). Nothing is persisted, which is why a
  delete currently erases history. Two *other* readers of the same rows:
  `getGameTacticBaselineNote` (`stats-dashboard.ts:84-103`, sums *all* other
  games' tactic counts — shrinks on delete) and `getPlayerStatsText`
  (`services/coach-player-stats.ts:26-70`, newest **20** same-speed games
  only — **unaffected** by deleting the *earliest* games; do not touch it).
- **Analysis already waits for the browser.** `analyses.status` has
  `'paused'` (`migrations/0038_paused_analysis_status.ts`);
  `markPaused` (`repositories/analyses.ts:270`) is set when the browser tunnel
  is absent and `findPausedGameIdsForUser` (`:290`) re-enqueues them when it
  reconnects (`routes/engine-tunnel.ts`). The web side already has
  `useAnalysisStatus` (per analysis SSE) and `useActiveAnalyses`
  (`GET /api/analyses/active`, all of a user's analyses). Nothing new is
  needed to "only complete when connected" — the plan only *counts* in-flight
  analyses and *waits* on them in the UI.
- **Tactical signal is already stored per game.**
  `players[color].tacticMotifs` = per-motif `{ opportunities, found,
  preventable?, prevented? }` (`shared/src/game-report.ts:39-64`; the
  `preventable`/`prevented` fields are optional — absent on old reports and
  must be treated as absent, not 0). No engine or LLM work is needed to rank
  games.
- **Coaching-session start and AI gating already exist in one place**:
  `useGameActions` (`apps/web/src/features/games/useGameActions.ts`) —
  `handleCoach` (`:81`, POST `/api/sessions`, gates on `useLlmSetupStatus` and
  shows `aiSetupPrompt` with an "Analyze instead" fallback) and
  `handleReview` (`:111`, → `/review/:gameId`, `App.tsx:84`). The import UI
  reuses these; it must not re-implement the AI-setup gate.
- **Error precedent for a machine-readable 429 reason**:
  `handleImportError` (`routes/games.ts`, bottom) already returns
  problem+json with an extension field (`missing: 'userColor'`, 422).
  `RateLimitError` (`lib/errors.ts:21`) carries only a message.
- **Test infra**: real-Postgres integration tests via
  `apps/api/test/helpers/db.ts`; migrations are registered by hand in
  `apps/api/src/db/migrate.ts` (last is `0040_puzzle_session_ply`, `:85`).

## Known things in the tree that this plan must respect

- **Uncommitted work is in flight.** `git status` shows the dashboard feature
  being moved to `features/progress`, plus edits to `routes/games.ts`,
  `services/games.ts`, `services/game-import.ts`'s neighbours and
  `GamesPage.tsx`. Start each task by `git diff`-ing the files it lists and
  build on the working tree, not on `HEAD`. Do not revert or reformat
  changes you did not make.
- **`ImportPage.tsx` is 336 lines** (limit: split past ~250, AGENTS rule 2).
  Phase 71's first task splits it; do not add to it before that.
- `ImportableGameSourceSchema.options` has **four** values; the doc comment
  on `listReadyReportsForUser` (`repositories/analyses.ts`, "three values") is
  stale. Fix the comment when touching that file.
- `RECENT_GAMES_LIMIT = 20` in both `services/lichess.ts:4` and
  `services/chesscom.ts:4`: a picker only ever offers 20 remote games, so the
  10-per-batch cap is a *selection* cap in the picker, not a fetch size.

## Layering reminder (AGENTS.md rules 1–5)

`route → service → repository → DB`. SQL only in
`apps/api/src/db/repositories/`. New data shape → zod schema in
`packages/shared` first, types via `z.infer`. Pure logic (bucket
merge/finalize, tactical scoring, allowance arithmetic) is I/O-free and
unit-tested with plain inputs. Functions small and named, early returns, files
< 200 lines. TDD: failing test first, watch it fail, implement, watch it pass.
Run `npm run lint && npm run typecheck && npm test` in full before calling a
phase done.

---

## Phase 67 — Import ledger and the new limits (server)

### Task 67.1: Limit constants and quota schema

**Read:** `packages/shared/src/game.ts:83-91` (current
`ImportQuotaResponseSchema`) and `:194-204` (the `MAX_DELETE_EARLIEST_IMPORTED`
precedent). Nothing else.

**Files:** new `packages/shared/src/import-limits.ts` (+ `index.ts` export),
`packages/shared/src/game.ts`, `packages/shared/src/import-limits.test.ts`.

- [ ] Failing test: constants are `DAILY_IMPORT_LIMIT = 30`,
      `WEEKLY_IMPORT_LIMIT = 150`, `MAX_IN_FLIGHT_IMPORTS = 10`,
      `MAX_LIBRARY_GAMES = 1000`, `AUTO_DELETE_BATCH = 50` (and
      `AUTO_DELETE_BATCH === MAX_DELETE_EARLIEST_IMPORTED`, so the manual
      and automatic delete can never disagree); `ImportQuotaResponseSchema`
      parses the new shape and rejects the old `{used, limit}` one.
- [ ] Implement. New `ImportQuotaResponse`:
      `{ daily: {used, limit}, weekly: {used, limit}, inFlight: {used, limit},
      library: {used, limit, autoDeleteCount} }`. Keep it one object so the
      UI makes one request. Also add `ImportLimitKind = 'daily' | 'weekly' |
      'in_flight'` (`z.enum`) for the 429 body.
- [ ] Commit: `feat: shared import-limit constants and quota schema`.

### Task 67.2: The `game_import_events` ledger

**Read:** `apps/api/src/db/migrations/0033_games_user_created_index.ts` (index
style) and `0040_puzzle_session_ply.ts` (migration style); `db/schema.ts`
table-interface style; `db/migrate.ts:40-85` (manual registration).

**Files:** new `apps/api/src/db/migrations/0041_game_import_events.ts`,
`db/schema.ts`, `db/migrate.ts`, new `db/repositories/game-import-events.ts`
(+ `.test.ts`).

- [ ] Failing repository test (Testcontainers): `record(userId, at)`;
      `countSince(userId, since)` counts only that user's rows at/after
      `since`; **a row survives after the user's game is deleted** (create a
      game, record, delete the game via `gamesRepo.remove`, count is still
      1).
- [ ] Migration: `game_import_events(id uuid pk default gen_random_uuid(),
      user_id uuid not null references users(id), created_at timestamptz not
      null default now())` + index `(user_id, created_at)`. **No FK to
      `games`.** Backfill in the same migration from `games` where
      `source IN ('paste','upload','lichess','chesscom')` and `created_at >=
      now() - interval '7 days'`, so limits are continuous across the deploy.
      `down` drops the table.
- [ ] Add the table to `schema.ts` and register in `migrate.ts`.
- [ ] Commit: `feat: game_import_events ledger so deleting a game never frees quota`.

### Task 67.3: Allowance arithmetic (pure) and in-flight count

**Read:** `apps/api/src/services/game-import.ts:26,66-80,165-185`;
`repositories/analyses.ts:270-300`.

**Files:** new `apps/api/src/lib/import-allowance.ts` (+ test), 
`db/repositories/analyses.ts` (+ test).

- [ ] Failing unit tests for pure `importAllowance({ dailyUsed, weeklyUsed,
      inFlight })` → `{ remaining, blockedBy: ImportLimitKind | null }`:
      `remaining = min(30-dailyUsed, 150-weeklyUsed, 10-inFlight)` floored at
      0; `blockedBy` is whichever limit is binding, ties resolved
      `in_flight` > `daily` > `weekly` (most actionable first: in-flight
      clears in minutes, daily in hours, weekly in days). Edge cases: all
      zero, exactly at each limit, over the limit (never negative).
- [ ] Failing repo test: `analysesRepo.countInFlightForUser(db, userId)`
      counts statuses `queued/engine_running/planning/paused` for that
      user's games only; `ready`/`failed` and other users' rows excluded.
- [ ] Implement both. Import the constants from `@freechesscoach/shared`.
- [ ] Commit: `feat: pure import allowance and in-flight analysis count`.

### Task 67.4: Enforce in `importGame`; return which limit tripped

**Read:** `services/game-import.ts:66-110`, `routes/games.ts` (`handleImportError`
and `POST /api/games`), `lib/errors.ts:1-25`,
`services/game-import` tests if present (`routes/games.test.ts`).

**Files:** `services/game-import.ts`, new `services/import-quota.ts`,
`routes/games.ts`, `lib/errors.ts` if needed, tests.

- [ ] Failing integration tests: (a) 30 imports succeed, the 31st → 429 with
      `limit: 'daily'`; (b) weekly: after backdating ledger rows so the daily
      window is clear but 150 exist in 7 days → 429 `weekly`; (c) **deleting
      a game does not reopen quota** (import 30, delete one, 31st still 429);
      (d) 11th import while 10 analyses are `queued` → 429 `in_flight`, and
      succeeds once one is `ready`; (e) a `coach_play`/`vs_bot` game does not
      consume quota (regression for the bug above); (f) a duplicate PGN
      returns the existing game and writes **no** ledger row and is never
      blocked by any limit.
- [ ] Implement `services/import-quota.ts` (`getImportQuota(db, userId)`
      composing the two ledger counts, `countInFlightForUser`, and the library
      count from Task 69.1 — until 69.1 lands, return `library: {used:
      <count>, limit: 1000, autoDeleteCount: 0}` computed with a temporary
      `gamesRepo` count you then keep). Replace `assertUnderDailyLimit` /
      `getDailyImportUsage` / `DAILY_IMPORT_LIMIT` in `game-import.ts`; call
      `importAllowance`; on `remaining === 0` throw a `RateLimitError`
      carrying `limit: <kind>`; extend `handleImportError`'s pattern (or
      the error mapper, whichever is smaller) so the problem+json body includes
      `limit`. Record the ledger row **in the same transaction as the game
      insert** so a failed insert doesn't burn quota. Message text is derived
      from the constants (`Import limit reached (30 games/day)`), never a
      hand-typed number.
- [ ] `GET /api/games/import-quota` (`routes/games.ts:82-85`) returns
      `getImportQuota`. Update its test and `docs/architecture.md` if it
      documents the route.
- [ ] Commit: `feat: 30/day, 150/week, 10 in flight — deletion no longer reopens quota`.

**Known limitation to leave documented in a code comment, not fixed:** two
concurrent `POST /api/games` from separate tabs can each pass the in-flight
check and land at 11. The client imports sequentially (see
`importForStatBank`, `ImportPage.tsx`), so this is a soft cap; a hard one
would need a per-user advisory lock — out of scope.

---

## Phase 68 — Weekly stat archive (deletion keeps stats)

The design constraint: today's dashboard = `buildStatsDashboard(entries)` where
each aggregator is a *mean/count over games*. To merge archived history with
live games exactly, each aggregator must be expressed as **(1) reduce games to
additive sufficient statistics, (2) merge by addition, (3) finalize to the
dashboard**. `buildStatsDashboard` becomes `finalize(merge(reduce…))`, so its
**existing tests are the equivalence proof** and must pass unmodified.

### Task 68.1: `StatsBucket` schema

**Read:** `packages/shared/src/stats-dashboard.ts:1-94` (dashboard shape) and
`chess-analysis/src/build-stats-dashboard.ts:1-135`,
`aggregate-opening-stats.ts`, `aggregate-rating-stats.ts` — the exact means
being replicated.

**Files:** `packages/shared/src/stats-bucket.ts` (+ test, + `index.ts`).

- [ ] Failing schema tests (round-trip; rejects negative counts; empty bucket
      valid). `StatsBucketSchema`, all numeric fields additive:
      - `games`
      - `opening`: `bookMovesSum`, `bookMovesGames`; `accuracySum`,
        `accuracyCount` (opening-phase accuracy, non-null only);
        `mistakesSum`, `mistakesGames`; `byOpening: Record<name,
        {games, points, accuracySum}>` (`points` = win 1 / draw 0.5 / loss 0,
        matching `resultPoints`).
      - `tactics`: `TacticMotifCounts` (already additive; keep `preventable`/
        `prevented` optional-and-absent-unless-reported).
      - `strategy`: six `{sum, count}` pairs (overall, pawnStructure,
        spaceAdvantage, activePiece, attacking, defending).
      - `endgame`: `accuracy {sum,count}`; `byStanding: Record<standing,
        {games, wins, losses, draws}>`; `byTheme: Record<theme, {games,
        accuracySum, accuracyCount}>` (note the existing code divides by
        games *with* an endgame accuracy but reports `gamesPlayed` of *all*
        games in the theme — both counts are needed).
      - `rating`: `{ sum, count }` (see Task 68.2 for how the trend uses it).
- [ ] Commit: `feat: StatsBucket schema (mergeable per-week stat sums)`.

### Task 68.2: reduce / merge / finalize (pure) — refactor `buildStatsDashboard`

**Read:** the four files named in 68.1 again, plus
`build-stats-dashboard.test.ts` and the two aggregate tests (do not modify
their expectations).

**Files:** new `packages/chess-analysis/src/stats-bucket.ts` (+
`stats-bucket.test.ts`), `build-stats-dashboard.ts`, `index.ts`. Split the
finalize half into `finalize-stats-dashboard.ts` if `stats-bucket.ts` passes
200 lines.

- [ ] Failing tests: (1) **property/equivalence**: for a fixture set of
      `StatsEntry[]` covering wins/losses/draws, null accuracies, missing
      strategy sub-scores, unknown opening, `preventable` present on some
      games and absent on others — `finalize(merge(entries.map(toBucket)))`
      deep-equals the *old* `buildStatsDashboard(entries)` output; (2)
      merge is associative and commutative and `emptyBucket()` is its
      identity; (3) splitting entries across any two buckets then merging
      equals one bucket of all of them; (4) `preventable`/`prevented` stay
      **absent** (not 0) when no merged game reported them.
- [ ] Implement `toBucket(entry)`, `mergeBuckets(a, b)`, `emptyBucket()`,
      `finalizeStatsDashboard(buckets, ratingPoints)`; rewrite
      `buildStatsDashboard(entries)` as their composition. Existing
      `build-stats-dashboard.test.ts` / aggregate tests pass **unchanged**.
- [ ] **Rating trend** (`aggregateRatingStats` is one point per game): keep
      per-game points for live games; an archived week contributes **one
      point** at the week's start with the week's mean estimated rating
      (`sum/count`), skipped when `count === 0`. Test: archived + live points
      are merged and sorted by `playedAt`.
- [ ] Commit: `refactor: stats dashboard as reduce/merge/finalize over mergeable buckets`.

### Task 68.3: `stats_archive_weeks` table and repository

**Read:** `0025_diagnostics.ts` (jsonb table precedent),
`repositories/diagnostic-profiles.ts` (jsonb read/write precedent).

**Files:** `migrations/0042_stats_archive_weeks.ts`, `db/schema.ts`,
`db/migrate.ts`, `db/repositories/stats-archive.ts` (+ test).

- [ ] Failing repo tests: `findForUpdate(trx, userId, weekStart, speed)`;
      `upsert(trx, {userId, weekStart, speed, bucket})` is idempotent per key;
      `listForUser(db, userId, since | null)` returns buckets whose week
      **overlaps** `since` (`weekStart + 7d > since`); `deleteByUserId`.
- [ ] Migration: `stats_archive_weeks(user_id uuid not null references
      users(id), week_start date not null, speed text not null, bucket
      jsonb not null, updated_at timestamptz default now(), primary key
      (user_id, week_start, speed))`. `bucket` typed as `Jsonb<unknown>` in
      `schema.ts`, parsed with `StatsBucketSchema` at read (AGENTS: no
      unvalidated jsonb).
- [ ] Commit: `feat: stats_archive_weeks table and repository`.

### Task 68.4: Bank stats on every non-account delete

**Read:** `services/games.ts:60-110`, `services/account.ts:8-45`,
`services/stats-dashboard.ts:59-69` (`toStatsEntry` — reuse it; export it
from a new small file rather than duplicate).

**Files:** new `services/stats-archive.ts` (+ test), `services/games.ts`,
`services/account.ts`, `services/stats-dashboard.ts` (extract `toStatsEntry`
to `services/stats-entry.ts`).

- [ ] Failing integration tests: (a) import + analyze a game to `ready`
      (fixture report), record dashboard, delete the game →
      `getStatsDashboard` is **deep-equal** before and after (the core
      guarantee), for `range: 'all'`; (b) two games in the same week/speed
      deleted one after the other → one archive row, bucket = merged sum;
      (c) games in different weeks/speeds → separate rows; (d) a game with no
      ready report, a `failed` analysis, a stale-schema report, or a
      `coach_play`/`vs_bot` source writes **no** row; (e) `deleteAccount`
      leaves **no** archive rows for the user; (f) the archive write and the
      cascade delete are one transaction — force the cascade to throw and
      assert no archive row persisted.
- [ ] Implement `bankGameStats(trx, game)` in `services/stats-archive.ts`:
      resolve week from `playedAt ?? createdAt` (same fallback as
      `listReadyReportsForUser`), `SELECT … FOR UPDATE` the bucket, `merge`,
      `upsert`. Add `deleteGameKeepingStats(trx, gameId)` = bank then
      `cascadeDeleteGame`; call it from `deleteGameForUser` and
      `deleteEarliestImportedGames`. **Leave `deleteAccount` calling bare
      `cascadeDeleteGame`** and add `statsArchiveRepo.deleteByUserId` to its
      list. Do not change `cascadeDeleteGame` itself (AGENTS: one
      responsibility; account deletion must stay a true wipe).
- [ ] Commit: `feat: deleting a game banks its stats into the weekly archive`.

### Task 68.5: Read the archive back into the dashboard and the tactic baseline

**Read:** `services/stats-dashboard.ts:27-45,84-123`.

**Files:** `services/stats-dashboard.ts`, `routes/stats.ts` only if a type
changes, tests.

- [ ] Failing tests: (a) `getStatsDashboard` with `range` + `speedFilter`:
      archived buckets are filtered by `speed` exactly like live entries
      (`speedFilter === 'all'` includes all speeds) and by week overlap for
      `range`; `gamesAnalyzed` = live count + archived `games`. (b)
      `getGameTacticBaselineNote`: `history` = live-others + archived tactic
      sums and `historyGames` = live-others + archived games, so deleting old
      games does **not** make the note disappear or change its rates.
- [ ] Implement: fetch archive rows with `statsArchiveRepo.listForUser`, merge
      with the live buckets, finalize. Reuse `sumTacticMotifs` shape from
      `stats-dashboard.ts:109-123` over merged bucket tactics.
- [ ] Note in a comment on `getStatsDashboard`: archived data is **week
      granularity**, so `last7`/`last30` may include a whole archived week
      that only partly overlaps the range; deletions target the *earliest*
      games, so this is rare and accepted.
- [ ] Commit: `feat: stats dashboard and tactic baseline include the weekly archive`.

---

## Phase 69 — Library cap and auto-delete

### Task 69.1: Count and make room

**Read:** `services/game-import.ts:66-110`, `services/games.ts:60-76`,
`repositories/games.ts:339-350` and `:380-395` (the other
`ImportableGameSourceSchema`-scoped query).

**Files:** `repositories/games.ts` (+ test), `services/game-import.ts`,
`services/import-quota.ts`, tests.

- [ ] Failing tests: (a) `gamesRepo.countImportableForUser` counts only the
      four importable sources; (b) at 1000 imported games, the next import
      deletes the 50 earliest (by `createdAt`, then `id` — same order as
      `listEarliestImportedIds`), then inserts, leaving 951; their stats are
      banked (dashboard unchanged apart from the new game); (c) at 999 the
      import does **not** delete; (d) `coach_play`/`vs_bot` games are
      neither counted nor deleted; (e) a duplicate-PGN import never triggers
      deletion; (f) delete + insert are one transaction — a failing insert
      rolls the deletion back; (g) `getImportQuota().library.autoDeleteCount`
      is 50 when `used >= limit`, else 0.
- [ ] Implement in `importGame`: after the allowance check and PGN parse
      (so an invalid PGN never deletes anything), if
      `countImportableForUser >= MAX_LIBRARY_GAMES` call
      `deleteEarliestImportedGames(trx, userId, AUTO_DELETE_BATCH)` inside the
      same transaction as the insert + ledger write (Task 67.4). Import the
      service function; do not re-query.
- [ ] Commit: `feat: auto-delete the 50 earliest games when the library hits 1000`.

**Semantics to pin in a test name and comment:** a batch of 10 that starts at
995 fills to 1000, the 6th import triggers the delete (→ 950), and imports
7–10 land normally. The pre-import notice (Task 71.3) computes
`willAutoDelete = library.used + selectedCount > library.limit`.

---

## Phase 70 — Recommended coaching game (programmatic)

### Task 70.1: Tactical points and the pick (pure)

**Read:** `packages/shared/src/game-report.ts:39-64`
(`TacticMotifCountsSchema`) and `chess-analysis/src/build-stats-dashboard.ts:30-52`
(how `preventable`/`prevented` absence is handled).

**Files:** new `packages/chess-analysis/src/coaching-candidate.ts` (+ test),
`index.ts`.

- [ ] Failing tests for `tacticalPointsOf(playerReport)`:
      `points = Σ_motif (opportunities − found) + Σ_motif (preventable −
      prevented)` where an absent `preventable`/`prevented` contributes 0,
      never `NaN` and never negative; and for
      `pickCoachingCandidate(games: {gameId, playerReport, playedAt}[])`:
      highest points wins; ties break to the **most recent** `playedAt`, then
      lowest `gameId` (deterministic); empty list → `null`; a game with 0
      points is still eligible when nothing scores higher (caller decides
      whether to surface it, see 70.2); result carries the top 3 motifs by
      missed count so the UI can say *why* ("missed 3 forks, 2 pins").
- [ ] Implement. All weights/limits live in `CONFIG`
      (`chess-analysis/src/config.ts`), not inline. Equal weight per missed
      tactic and per allowed tactic to start; a comment records that this is a
      heuristic to tune, not a calibrated rating.
- [ ] Commit: `feat: rank analyzed games by tactical points for coaching`.

### Task 70.2: Endpoint

**Read:** `routes/games.ts` (static routes are registered ahead of `/:id`,
see the comment at `:36-37`), `services/stats-dashboard.ts:59-69`.

**Files:** `shared/src/game.ts` (request/response schemas),
`services/coaching-candidate.ts` (+ test), `routes/games.ts`.

- [ ] Failing integration tests: `GET /api/games/coaching-candidate?gameIds=a,b,c`
      (validated with a zod schema, max 10 ids = `MAX_IN_FLIGHT_IMPORTS`)
      returns the top game among **the caller's own** games whose analysis is
      `ready` — ids belonging to other users are silently ignored (assert with
      a second user); unfinished/failed games are ignored; no eligible game →
      `{ candidate: null }`; response includes `gameId`, `points`, and the
      top motifs.
- [ ] Implement: route parses/validates → service loads
      `analysesRepo`-side reports for those ids (add a
      `listReadyReportsForGames(db, userId, gameIds)` sibling to
      `listReadyReportsForUser` in the repository — SQL stays there) → pure
      `pickCoachingCandidate`. No LLM anywhere in this path.
- [ ] Commit: `feat: coaching-candidate endpoint for a just-imported batch`.

---

## Phase 71 — Import UI

### Task 71.1: Split `ImportPage.tsx` before adding to it

**Read:** all of `apps/web/src/features/import/ImportPage.tsx` (336 lines) and
`ImportPage.test.tsx`.

**Files:** `ImportPage.tsx`, new `useRemoteImport.ts` (the remote lists +
username-prompt mutations + bulk selection state), new
`bulkImport.ts` (`importForStatBank`, its `BulkImportArgs`), tests.

- [ ] Pure refactor: `ImportPage.test.tsx` passes **unchanged** before and
      after. `ImportPage.tsx` ends < 200 lines, hooks own fetching (AGENTS
      rule 7).
- [ ] Commit: `refactor: split ImportPage into page, remote-import hook and bulk-import helper`.

### Task 71.2: Quota-aware picker and copy

**Read:** `RemoteImportPanel.tsx:40-82`, `RemoteGamePicker.tsx:60-106`,
`games/ImportShortcuts.tsx`, `games/GamesPage.tsx:34-49`,
`GamesPage.test.tsx:196`, `ImportPage.test.tsx:84,94,553,570`,
`ImportErrorNotice.tsx`.

**Files:** new `useImportQuota.ts` in `apps/web/src/hooks/` (one query for
`/api/games/import-quota`, shared by Games and Import pages — replaces the
inline query at `GamesPage.tsx:37-40`), the picker/panel files above, tests.

- [ ] Failing tests: the picker will not let the user tick more than
      `min(remaining daily, remaining weekly, remaining in-flight)` games (the
      rest are disabled with the reason as their label); the bulk button
      reads `Import N games` (drop "for stat bank" wording — it is a plain
      batch now); `RemoteImportPanel.tsx:77`'s hard-coded "(10 games/day)" is
      replaced with copy from `ImportQuotaResponse`/`ImportLimitKind` (three
      distinct messages: daily, weekly, "finish analyzing your current games
      first — keep this tab open"); `ImportShortcuts` shows `{daily.used} of
      {daily.limit} today` (update `GamesPage.test.tsx:196`).
- [ ] Update the four `ImportPage.test.tsx` fixtures that hard-code "10
      games/day" to the new numbers/`limit` field.
- [ ] Commit: `feat: import UI reflects 30/day, 150/week and the 10-at-a-time cap`.

### Task 71.3: Auto-delete notice, shown before importing

**Read:** `FindGamesPage.tsx:140-155` (the existing `ConfirmDialog` usage for
"delete earliest 50") — reuse that component and copy tone.

**Files:** new `AutoDeleteNotice.tsx` (+ test) in `features/import/`,
`ImportPage.tsx`/`useRemoteImport.ts` wiring.

- [ ] Failing tests: when `library.used + selectedCount > library.limit`
      (selectedCount is `1` for paste/upload/single remote import), the
      import action is preceded by a `ConfirmDialog`: "You have {used} of
      {limit} games. Importing will delete your {autoDeleteCount} earliest
      games. Their stats are kept." with **Import and delete** / **Cancel**;
      below the threshold no dialog appears; cancel imports nothing.
- [ ] Commit: `feat: tell the user before auto-deleting the 50 earliest games`.

### Task 71.4: Single import — Analyze / Get coaching session

**Read:** `ImportPage.tsx:120-125,231-235` (the current auto-`POST
/api/sessions` `useEffect`), `AnalysisProgress.tsx:150-196`,
`games/useGameActions.ts:26-121`.

**Files:** `ImportPage.tsx` (or a new `SingleImportFlow.tsx` from Task 71.1's
split), `PgnPasteForm.tsx`, `PgnUploadForm.tsx`, remote single-select path,
tests.

- [ ] Failing tests: every single-game entry point (paste, upload, tapping
      one remote game) offers two submit buttons — **Analyze** and **Get
      coaching session**; the chosen `intent` (`'review' | 'coach'`) is held
      in state; when the status hook reports `ready`, `review` navigates to
      `/review/:gameId` and `coach` starts the session **through
      `useGameActions.handleCoach`** (so the no-AI-setup modal and its
      "Analyze instead" fallback still work — assert the modal appears with no
      LLM setup); nothing navigates before `ready`; the 422 "which colour"
      round-trip (`ColorConfirm`) preserves the chosen intent.
- [ ] Remove the unconditional auto-session `useEffect`; that behaviour is now
      the `coach` intent only.
- [ ] Commit: `feat: choose Analyze or Get coaching session when importing one game`.

### Task 71.5: Batch progress and the recommended game

**Read:** `hooks/useActiveAnalyses.ts` (all), `AnalysisProgress.tsx`,
`games/GameRow.tsx`/`GameCard` only for the status-chip vocabulary.

**Files:** new `BatchAnalysisProgress.tsx` and `RecommendedGameCard.tsx`
(+ tests) in `features/import/`, `bulkImport.ts` (return the created
`gameId`s — today `BulkResult` returns only counts), `ImportPage.tsx`.

- [ ] Failing tests: after a batch import of ≥ 2 games, the page **stays**
      (no `navigate('/games')` at `ImportPage.tsx`'s `bulkImportMutation.onSuccess`)
      and shows per-game progress from `useActiveAnalyses`, including a
      "waiting for your browser — keep this tab open" state for `paused`
      analyses; when every game in the batch is `ready` it queries
      `/api/games/coaching-candidate?gameIds=…` and renders the recommended
      game (players, result, and the "why" motifs from 70.2) with **Start
      coaching session** (→ `handleCoach`) and **Review it first** (→
      `/review/:id`) plus **Go to my games**; a `null` candidate shows only
      "Go to my games"; a partially failed batch still lists the games that
      did import.
- [ ] Commit: `feat: recommend the most tactical game after a batch import`.

---

## Phase 72 — Docs and full sweep

### Task 72.1: Docs

**Files:** `docs/architecture.md` (only the sections that mention import,
stats or deletion — `grep -n "import\|stats\|delet" docs/architecture.md`),
`AGENTS.md`.

- [ ] Document the ledger, the three limits + library cap, the weekly archive
      (bucket shape, week key, the archive-vs-account-deletion rule), and the
      recommended-game heuristic. Cite `file:line` as elsewhere in that doc.
- [ ] When this plan is complete, replace `docs/plan.md` with the next plan
      and update AGENTS.md's `docs/plan.md` bullet in the same change.
- [ ] Commit: `docs: import limits, stat archive and guided import`.

### Task 72.2: Full check and manual pass

- [ ] `npm run lint && npm run typecheck && npm test` — full, locally.
- [ ] `npm run dev`, then by hand: import 3 remote games and watch the batch
      progress → recommendation; close the tab mid-analysis and confirm
      analyses go `paused` and resume on reconnect; delete a game and confirm
      `/stats` numbers do not move; force `library.used` to 1000 in the DB and
      confirm the notice, the 50 deletions, and unchanged stats.
- [ ] Commit only if the pass produced fixes: `fix: …` (one per fix).

---

## Standing constraints

- **Never let a deletion path lose stats silently.** Any new code that deletes
  imported games must go through `deleteGameKeepingStats`; only
  `deleteAccount` may call bare `cascadeDeleteGame` on imported games.
- **Never key quota off the `games` table.** Only `game_import_events`.
- **Limits are constants in `packages/shared/src/import-limits.ts`.** UI copy
  and server messages derive from them; a literal `10`/`30`/`150`/`1000`
  anywhere else is a review failure.
- **`preventable`/`prevented` are absent, not zero, on old reports** — every
  new aggregation must preserve that (Task 68.2 test 4, Task 70.1).
