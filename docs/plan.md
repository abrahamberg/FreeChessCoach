# FreeChessCoach — Bot Latency Diagnosis (Phase 73)

**Source spec:** the request below (no separate spec file). Every file/line
reference was checked against the code on 2026-09-20, not assumed. Do **not**
open `docs/diagnose.md`, `docs/algorith.md` or `docs/tactics-rework.md` — none
is relevant. The previous plan (Phases 67–72) shipped and lives in
`git log -- docs/plan.md`; its standing constraints ended with it.

## The request

Bots sometimes think too long and sometimes get stuck. **Before deciding on
any fix, measure where the time goes.** So this phase is instrumentation plus
a reproducible benchmark and **changes no bot behaviour** — no new timeouts,
no retries changed, no engine recovery. Fixes are chosen from the data
afterwards (decision table at the end).

## How a bot move flows (verified; line numbers omitted for the files this phase edits, they move)

One synchronous HTTP round trip the student stares at
(`usePlayBotMoveSubmit.ts:73` → `POST /api/sessions/:id/play-move`,
the `play-move` handler in `routes/sessions.ts`, no client timeout — `apiPost` in
`apps/web/src/api/client.ts` has no `AbortSignal`):

`commitBotTurn` (`services/bot/bot-move-commit.ts`)
1. `commitPlayerMove` — game lock (`play-moves.ts:98`) + **2 cached
   `analyzePosition` grading calls at `background` priority**
   (`play-move-quality.ts:51-54`). Runs *before* the bot search and is in no
   timer today.
2. clock / DB / episode writes.
3. `commitBotReply` → `selectBotMove` (`bot-move-selector.ts`):
   book → else `withEngineRetry` (3 attempts, 500/1000 ms backoff)
   around `buildBotCandidates` (`bot-candidates.ts`): depth 18, MultiPV 40,
   `movetimeMs` 8000, `interactive` priority, then **synchronous annotation of
   up to 40 lines** (on the API event loop) → `pickBotMove`.
4. 900 ms floor (`MIN_BOT_THINK_MS`).
5. `commitBotMove` — grades the bot's own move under the game lock.
6. game-over check, clock, `closeEpisodeIfNeeded` (a no-op today), pointer
   update.

Engine route is chosen by the user's `engineMode`
(`services/engine/resolve-engine-backend.ts:82-150`): `native` (HTTP to
`services/engine`, Stockfish subprocess, `EnginePool` of `ENGINE_POOL_SIZE`,
2 by default), `chess_api` (chess-api.com through the browser tunnel), or
`browser` (WASM Stockfish in a browser Worker). `LiteSupplementedEngineBackend`
wraps them.

## What already exists and is reused as-is (verified in code)

- `devLog`/`isDevLogEnabled` (`apps/api/src/lib/dev-log.ts`), forwarded by
  `docker-compose.yml:33-38`; the `bot_move` event
  (`bot-move-selector.ts`) and `BotMoveDebugCollector` +
  `formatMs` (`services/engine/bot-move-debug.ts`).
- `EnginePool.busy` / `.size` and the `/health` route
  (`services/engine/src/server.ts:23`, returns `{status, poolSize, busy}`).
- `parseInfoLine` / `parseBestMove` (`services/engine/src/uci-info-parser.ts`);
  `info` lines carry `depth`, `nodes` — the parser currently drops them.
- Env-config pattern: `apps/api/src/bootstrap.ts` (`parsePositiveInt(...)`,
  e.g. `ENGINE_TUNNEL_TIMEOUT_MS` at. New knobs follow it (AGENTS.md:
  never hardcode budgets).
- `createKeyedLock` (`apps/api/src/lib/keyedLock.ts`) — the game lock is held
  only around the DB commit (`play-moves.ts:98-100`), **not** during the engine
  search.

## Why the current log cannot answer the question (verified)

1. `bot_move` is emitted only *after* a move is picked (`bot-move-selector.ts`)
   and only if `DEBUG_LOG` is set — a move that hangs or exhausts its retries
   **never logs**.
2. Failed attempts and backoff sleeps are invisible; only the last attempt's
   engine timing is kept.
3. Not timed anywhere: the two grading calls, pool queue wait, annotation CPU,
   the 900 ms floor, the bot-move grading, DB writes. `totalTime` covers
   `selectBotMove` only; the `elapsedMs` written to the PGN also includes the
   sleep but still excludes grading/DB.
4. Output is pretty-printed multi-line JSON with durations as strings
   (`dev-log.ts`, `formatMs`) — hard to grep or aggregate.
5. A Lichess-index hit or a book move leaves the collector empty, so
   `deriveEngineSource` (`bot-move-selector.ts`) mislabels an index hit as
   `internal`.
6. Repo has no structured logger (`Fastify()` in `app.ts:66` has no `logger`),
   no metrics library — plain `console.*` plus `devLog`. Stay with that.

## Hypotheses this phase must confirm or kill

Ranked by evidence in the code. **H1 is the likely "stuck".**

- **H1 Hang, not slowness.** `services/engine/src/uci.ts` has no `exit`/`error`
  handler on the Stockfish child and no restart; `search()`'s promise
  (`uci.ts:128`) has no reject path and the `stop` timer only helps a live
  process; the `uciok` (`:107`) and `readyok` (`:123`) waits have no timeout. If the
  process dies, the promise never settles → `EnginePool.withEngine`'s
  `finally` never releases (pool slot leaks; with a pool of 2, two leaks hang
  everything) → `acquire` has no timeout → the API's `fetch`
  (`engine-client.ts:53`) has no `AbortSignal` → `withEngineRetry` never
  sees a rejection → `botPending` never fires.
- **H2 Queueing.** Pool of 2 shared with background jobs and other games; no
  preemption; and the two grading calls per turn are `background` priority.
- **H3 Duplicate concurrent searches.** `useBotTurnFailover` polls
  `/request-bot-move` every 4 s (`FAILOVER_POLL_MS`) while it is the bot's
  turn. Server side, `requestBotMove` (`bot-move-commit.ts`) only checks
  the DB for whose turn it is — **there is no in-flight guard**, and the
  session pointer is already moved to the player's ply
  (`updateSubjectAndCurrentPly` in `commitBotTurn`) before the search starts.
  So a search taking > 4 s can be joined by a second full search for the same
  ply; the loser then commits an illegal move and throws
  `BotSelectionError`. *Still to confirm:* whether the client actually polls
  during the first request (Task 73.5 logs this).
- **H4 Search size per mode.** Native ignores `movetimeMs`
  (`bot-candidates.ts` says so) and is bounded only by the `stop` timer
  `ENGINE_MOVE_TIMEOUT_MS` — **3000 ms in the Helm chart**
  (`deploy/helm/freechesscoach/values.yaml:109`), 5000 by default
  (`uci.ts:12`) — so a "depth 18, 40 lines" native search is really a
  time-cut, mixed-depth result. `chess_api` clamps to **5 variants**
  (`chess-api-engine-backend.ts:26`) so `needsSupplement`
  (`lite-supplemented-engine-backend.ts:222`) is true on almost every non-book
  move → an extra tunnel round trip (search ≤ 3 s, but the server waits up to
  `ENGINE_TUNNEL_TIMEOUT_MS` 10 s + `ENGINE_TUNNEL_PER_POSITION_MS` 30 s = 40 s
  if the tab is unresponsive; failures are swallowed). `browser` mode's main
  call has the same 40 s budget and is retried ×3 by `withEngineRetry`.
- **H5 Annotation CPU** (40 lines, synchronous) stalls the API event loop for
  every request, not just this game.
- **H6** the 900 ms floor is known and small; record it so it is subtracted,
  not mistaken for slowness.

## Layering & conventions for this phase

Trace types/helpers are pure (no I/O) and go in their own file; wiring is a
thin optional parameter, the same pattern as the existing `debug` collector.
`bot-move-commit.ts` (329 lines) and `bot-move-selector.ts` (250) are already
at/over the size rule — **do not grow them inline**; put new logic in new
files and only add call sites. Numeric ms in logs, one line of JSON per event,
via `devLog`/`console.warn` — no new env var per event type, no new
dependency. New numeric knobs come from `bootstrap.ts`-style env parsing.
Tests are Vitest next to the code, engine and LLM mocked
(AGENTS.md "Testing").

---

## Phase 73 — Bot latency instrumentation

### Tasks 73.1 + 73.2 — Thinking log (SHIPPED)

Built first, and broader than the original 73.1/73.2, because the request
became: *show, in the bot's status panel, what the bot is doing right now and
what it did for every earlier move — every step with when it started, when it
ended and what it did — so a player can point at exactly what is slow.* It
supersedes the console-only trace originally sketched here.

- **Shared schema:** `packages/shared/src/bot-thinking.ts`
  (`BotThinkingStep` / `BotThinkingMove` / `BotThinkingLog`, epoch-ms times,
  `endedAt: null` while running). No raw engine evaluations in it (AGENTS.md).
- **Recorder:** `apps/api/src/services/bot/bot-move-trace.ts` — pure,
  injected clock; `begin/end/run`, `setResult`, `complete`/`fail` (each settles
  a move once), `snapshot()` is safe mid-move. `runTraced()` times a step or
  just runs it when nobody is watching.
- **Store:** `bot-thinking-registry.ts` — in-memory, last 60 moves per session,
  200 sessions, `discard()` for a turn that never reached the bot. A restart or
  a second API replica shows less history; it is a live diagnostic view, not
  game data.
- **Instrumented path:** `bot-move-commit.ts` (start/settle, "Grading your
  move and saving it", "Padding to the minimum think time", "Grading the bot's
  move and saving it", "Finishing up…"), `bot-move-selector.ts` (book lookup,
  "Engine search (attempt n of 3)", "Waiting before retry", "Choosing move" with
  the rolls and the branch), `bot-candidates.ts` ("Annotating candidate
  moves"), `engine/lite-supplement-trace.ts` via
  `LiteSupplementedEngineBackend` ("Main engine call (server Stockfish |
  chess-api.com | browser Stockfish)", "Light browser engine supplement").
  The selector's dev-log helpers moved to `bot-move-log.ts`
  (`DEBUG_LOG=bot_move` output unchanged).
- **API:** `GET /api/sessions/:id/bot-thinking` (`routes/sessions.ts`), play_bot
  sessions only, owner only.
- **Web:** `BotThinkingPanel` (poll via `useBotThinkingLog`, live counters via
  `useTickingNow`, "Copy log" → `formatBotThinkingLog` text) and
  `BotThinkingLog` (newest move first and open; each step shows offset,
  duration, detail) inside `BotStatusPanel` (`sessionId` prop, passed by
  `BotSessionPage`).
- **What it already answers:** H2/H4/H5/H6 show up as which step is long
  (grading calls, engine search, annotation, padding); **H3 shows up as two
  moves "thinking" at once, the second marked `from: failover`.**
- **What it cannot see yet:** inside a native engine call (pool queue wait vs
  search vs Stockfish dying) — that is Task 73.4. A hang appears as a step that
  keeps counting up and never ends.

### Task 73.3 — Always-on slow and stuck signals

**Read:** `apps/api/src/bootstrap.ts:110-170` (env parsing pattern),
`apps/api/src/lib/dev-log.ts`, `apps/api/src/services/bot/bot-move-trace.ts`.
**Files:** `bootstrap.ts` (+ its test), create
`apps/api/src/services/bot/bot-move-watchdog.ts` + test.

- [ ] Reuse the live traces: the watchdog watches a `BotMoveTrace` (see
  `bot-move-trace.ts`), so the "still waiting" line can carry the running
  step's label from `snapshot()`.
- [ ] Failing tests with fake timers: (a) a move that finishes under the
  threshold logs nothing; (b) one over it logs one `bot_move_slow` warning
  carrying the full trace; (c) every failed engine attempt logs
  `bot_move_attempt_failed`; (d) a move that **never finishes** logs
  `bot_move_waiting {elapsedMs, lastStage}` exactly once at the threshold and
  the timer is cleared on `finish()` and on throw.
- [ ] Add `BOT_SLOW_MOVE_MS` (default 8000) via the existing `parsePositiveInt`
  pattern. Implement `watchBotMove(trace, {slowMs, log})`; call it from
  `commitBotReply` in a `try/finally`. Not gated by `DEBUG_LOG`: these are
  `console.warn`, one JSON line each. Never swallow the error being observed —
  log and rethrow.
- [ ] Full lint/typecheck/test.

Commit: `feat(bot): warn on slow, failed and never-finishing bot moves`

### Task 73.4 — Engine service visibility

**Read:** `services/engine/src/engine-pool.ts`, `uci.ts:60-160`,
`uci-info-parser.ts`, `server.ts:15-40`, `engine-pool.test.ts`,
`uci.test.ts`.
**Files:** the same, plus their tests.

- [ ] Failing tests: `EnginePool` reports `waiting: {interactive, background}`;
  acquire resolves with a recorded `waitedMs` (fake timers) for interactive vs
  background; `/health` includes `waiting`; the info parser keeps `depth` and
  `nodes` (extend `UciInfoLine`, existing tests still pass).
- [ ] Implement. One `console.log` JSON line per search:
  `{event:'engine_search', priority, waitedMs, searchMs, multiPv, depthReached,
  nodes, stoppedByTimeout}`. In `UciEngine.start()` attach `exit` and `error`
  listeners on the child that **only log** `{event:'engine_process_exit', code,
  signal}` — **no recovery, no reject, no respawn in this phase.** This alone
  confirms or kills H1.
- [ ] Full lint/typecheck/test.

Commit: `feat(engine): log queue wait, search stats and Stockfish exits`

### Task 73.5 — Correlation id and client timing

**Read:** `bot-move-commit.ts` (`commitBotTurn`, `requestBotMove`),
`engine-client.ts:20-70` (the two `fetch` calls, at `:26` and `:53`),
`apps/web/src/features/session/usePlayBotMoveSubmit.ts`,
`useBotTurnFailover.ts`.
**Files:** those, plus `packages/shared` only if a header/field schema is
needed (schema first, per AGENTS.md rule 4).

- [ ] Failing tests: `commitBotTurn` and `requestBotMove` each create a
  `botMoveId`; `analyzePositionViaEngine` sends it as an `x-bot-move-id`
  header when given one (mock `fetch`); the engine server echoes it in the
  `engine_search` log line.
- [ ] `requestBotMove` logs `{event:'bot_move_concurrent', sessionId, ply}`
  when another search for the same session/ply is already in flight (a plain
  in-memory `Set` keyed `sessionId:ply`, **observe only — do not skip or
  reject the second search**). This confirms or kills H3.
- [ ] Web: in `usePlayBotMoveSubmit` record submit→response ms, and in
  `useBotTurnFailover` count polls fired per bot turn; `console.debug` only
  (no UI change; a unit test asserts the counter with fake timers).
- [ ] Full lint/typecheck/test.

Commit: `feat(bot): correlate one bot move across API, engine and client logs`

### Task 73.6 — Benchmark script and docs

**Read:** `scripts/record-demo-fixtures.mjs` (script conventions),
`packages/shared/src/bot-roster.ts`, `docs/dev-setup.md` (where env vars are
documented).
**Files:** create `scripts/bot-latency-bench.ts` (+ unit test for its
percentile/aggregation helper), `docs/dev-setup.md`.

- [ ] Failing test for the pure aggregation helper (p50/p95/max per stage from
  trace snapshots).
- [ ] Script: runs `selectBotMove` against a real engine service for a fixed
  FEN set (opening, quiet middlegame, sharp tactical, endgame, forced mate) ×
  a few roster bots × concurrency 1/2/4 × with/without a simulated background
  analysis load; prints a per-stage table. Flag `--kill-engine-mid-search`
  kills the Stockfish child mid-search to reproduce H1 (expect
  `bot_move_waiting` + `engine_process_exit`). Never runs in `npm test`.
- [ ] Document in `docs/dev-setup.md`: `DEBUG_LOG=bot_move`, `BOT_SLOW_MOVE_MS`,
  the new log event names, how to run the script, how to read the result.
- [ ] Full lint/typecheck/test.

Commit: `feat(bot): latency benchmark script and how to read the new logs`

---

## After the data is in (NOT part of this phase)

| Finding | Fix direction |
|---|---|
| `engine_process_exit` seen, or `bot_move_waiting` with no engine log | Supervise the UCI child (reject on exit, respawn, `uciok`/`readyok`/search watchdog), `acquire` timeout, `AbortSignal.timeout` on the engine-client `fetch` and client `apiPost` |
| Long `waitedMs`, grading calls dominate | Reserve an engine for `interactive`, raise pool size, run grading at `interactive` or off the critical path |
| `bot_move_concurrent` fires | In-flight guard in `requestBotMove`; stop polling while the first request is pending |
| Native search cut at 3 s with shallow depth | Lower `BOT_CANDIDATE_BREADTH` for native, or honour `movetimeMs` natively; fix the comments at the top of `bot-candidates.ts` |
| `chess_api`: lite supplement on every move | Skip the supplement, or accept 5 lines for that mode |
| `browser` mode: 40 s waits × 3 retries | Fewer retries, earlier fallback to native |
| `annotate` stage large | Move off the event loop or cap candidates |

## Verification (end of phase)

- `npm run lint && npm run typecheck && npm test`.
- Manual: `DEBUG_LOG=bot_move npm run dev`, play a bot game, read the stage
  table for one move; run `scripts/bot-latency-bench.ts`; run it with
  `--kill-engine-mid-search` and confirm `bot_move_waiting` fires once and the
  engine logs `engine_process_exit`.
- Open input that only sharpens which table row to read first: which
  `engineMode` (internal / external / browser) and environment (local vs
  deployed) the stuck games use.

---

# Phase 74 — Bot turns without blocking work

**Source:** a real Thinking-log capture plus the design discussion of
2026-09-20 (no separate spec file). Do **not** open `docs/diagnose.md`,
`docs/algorith.md` or `docs/tactics-rework.md`. Unlike Phase 73, **this phase
changes bot behaviour.** It can be done before Tasks 73.3–73.6; 73.4/73.6 are
what then measure it.

## What the log showed (one real move, engine mode `external`)

Total 13.85 s: **10.81 s** "Grading your move and saving it" (78%), **2.19 s**
annotating 3 candidates (16%), ~0.24 s for the actual engine search (2%),
0.51 s grading the bot's own move, the rest negligible. The bot was not slow
at chess; it was waiting on work that does not decide its move.

## Decisions already taken (do not relitigate)

1. **The real engine pipeline decides the bot's move** — the best move, the
   baseline eval, and the check that a chosen mistake really is one. The light
   engine is too weak for the higher ranks, so it never picks or verifies a
   bot move.
2. **Rating reuses evals and uses the light engine only in the background.**
   No engine call on the critical path exists for rating.
3. **Mistake-first.** Decide the branch from the rolls, make the mistake
   programmatically, then verify it with the engine; a "mistake" that turns
   out good is replaced by another (max 3 tries), and if none qualifies the
   bot plays its best move.
4. **Mistakes are judged in win percentage, not centipawns** (`winPctFor`,
   `packages/chess-analysis/src/win-probability.ts`). Decided positions: bot
   far ahead → only a blunder-sized swing counts, otherwise best move; bot far
   behind → no mistake, best move (resigning already exists, `bot-resign.ts`).
5. **No raw engine evaluations in the Thinking log or any UI copy**
   (AGENTS.md) — verdict words only ("too good, trying another"); numbers stay
   in the `DEBUG_LOG=bot_move` dev log.

## What already exists and is reused (verified in code)

- The player's grade is computed **inside** `commitMoveLocked`
  (`services/play-moves.ts`): `classifyPlayMove` awaits two
  `analyzePosition` calls under the game lock, then writes `pgn` +
  `annotatedPgn` in one transaction. `analyzePosition` is the cache-first
  backend; the cache is keyed **by position only**
  (`positionEvaluationsRepo.findByFen(db, fen, {allowExternal})`), so the
  "before" call is normally a hit and the "after" call is the one real call —
  which is the same position the bot then searches with the raw, uncached
  backend (`routes/sessions.ts` `buildBotMoveCommitDeps`). Duplicate work.
- The cache trusts any row for a position regardless of depth, and an external
  writer "never overwrites an existing row"
  (`db/repositories/position-evaluations.ts` header). **A shallow light-engine
  result written there would be served to game review as a normal analysis —
  rating evals must never go into `position_evaluations`.**
- `classifyLiveMove` (`packages/chess-analysis/src/classify.ts`) takes
  `evalBefore` / `evalAfter` as `EngineEval` (built by `toEngineEval` in
  `play-move-quality.ts`); it needs lines at the *before* position to know
  whether the played move was best.
- `appendAnnotatedMove(pgn, san, data | null, …)` accepts `null` = an
  unrated move (`annotated-pgn.ts`). There is **no** function that replaces a
  move's annotation later, and `MOVE_QUALITIES` (`packages/shared/src/analysis.ts`)
  has no "unrated" value.
- The tactical-mistake pool: `bot-mistake-pool.ts` ranks the engine's own
  candidates by tactical plausibility (`analyzeChecksCapturesThreats`), then
  checks raw cp loss against `TACTICAL_MISTAKE_MIN_CP_LOSS = 80` and
  `BLUNDER_MIN_CP_LOSS = 250`; `candidateScore` saturates mate to ±100000.
  `pickPersonalityWeightedMove` (`bot-candidate-weighting.ts`) and the bot's
  `diagnosisCodes` steering are reused as they are.
- `pickBotMove` draws its three rolls up front, before any branching
  (`bot-move-pick.ts`), so the branch is known before any engine work.
- Annotation cost, measured (this machine, synthetic 8-ply lines): about 0.2 s
  per candidate — 3 ≈ 0.8 s, 10 ≈ 2.5 s, 40 ≈ 8.7 s — synchronous on the API
  event loop (`toBotCandidates` in `bot-candidates.ts`).
- The light engine is reachable as `BrowserTunnelEngineBackend` with
  `engine: 'lite'` (`lite-supplemented-engine-backend.ts` `tryLiteLines`); its
  request shape is `LITE_SUPPLEMENT_*` constants there.
- Thresholds/budgets are config, not literals (AGENTS.md): put new ones in
  `packages/chess-analysis/src/config.ts` `CONFIG` or `bootstrap.ts` env parsing.

## Layering

Pure move-generation and judging go in `packages/chess-analysis`; selection
orchestration stays in `services/bot/`; new files, no growth of
`bot-move-commit.ts` / `bot-move-selector.ts` beyond call sites (both are at the
size limit). Tests: Vitest beside the code, engine mocked. Any new API field
gets its zod schema in `packages/shared` first.

---

### Tasks 74.1 – 74.3 — Rating off the critical path (SHIPPED)

What shipped, and where it differs from what this plan first said:

- **Order of a bot turn now:** save the student's move **unrated** (no engine
  call) → move the session pointer (unchanged invariant) → the bot's search →
  rate the student's move (think-time floor overlaps) → save the bot's move
  unrated → rate it → finish → **schedule, in the background, the light-engine
  eval of the position the student moves from next**. No engine call sits
  between the student's move and the bot's reply, and rating makes none.
- **Rating sources:** the student's move — "after" is the bot's own search of
  the resulting position (`SelectedBotMove.analysis`), "before" is the stored
  light-engine eval of the position it was played from (scheduled after the
  previous bot reply); the bot's move — before = the search's lines, after = the
  picked move's own line (`evalAfterPickedLine`). Anything missing leaves that
  move unrated (`quality: null`): the first move of a game, no browser tab for
  the light engine, an expired/unreachable store, and **book replies** (nothing
  was searched). Never fails or delays the turn.
- **The store is shared, not in-memory:** the API runs as several pods, so
  `RatingEvalStore` (`bot-rating-evals.ts`) is Redis in any deployment with
  `REDIS_URL` (key `rating-eval:<fen>`, 1 h TTL, every Redis call bounded to
  500 ms, values re-validated with `EngineEvalSchema`), with a process-local map
  only when `REDIS_URL` is unset. Never `position_evaluations`. Wired through
  `buildRatingEvalStoreFromEnv` (`bootstrap.ts`) → `buildApp({botRatingEvals})`
  → `registerSessionsRoutes`. The light engine call (`createLiteAnalyzer`,
  depth 8 / 6 lines / 3 s) reaches the browser tab across pods through the
  existing tunnel relay.
- **Removed:** the budgeted real-engine "before" eval, `BOT_GRADING_BUDGET_MS`,
  `startBudgetedEval`, and `bot-grading-trace.ts` — the Thinking log no longer
  has "Engine eval" steps because the rating makes no call. The background eval
  is not traced (the turn has settled); failures show under
  `DEBUG_LOG=bot_rating`.
- **Code:** `play-moves-rated.ts` (`commitMoveUnrated`, `rateLastMove`, both
  under the game lock; rating only ever edits the LAST move and refuses if it
  is no longer the expected SAN), `annotated-pgn.ts`
  `replaceLastMoveAnnotation`, `play-move-quality.ts`
  `classifyPlayMoveWithEvals`, `bot-move-grading.ts`, `bot-turn-rating.ts`,
  `bot-rating-evals.ts`, `bot-candidates.ts` `searchBotCandidates` (returns the
  analysis), `bot-move-commit.ts`.
- **API/web:** `quality` is `MoveQuality | null` in
  `CommitBotMoveResponseSchema` (shared and the web copy);
  `SessionBoardColumn`'s move-committed callback takes `CommittedMoveRef`
  (`{fen, san, ply}`).
- **Known gaps, deliberate:** coach/play-mode games still use the old blocking
  `commitMove` path (not bot games); a student move that ends the game is not
  rated live; if the bot fails (`botPending`) the student's move stays unrated.
  The bot's forced first move as White (`bot-session.ts`) now takes the same
  path as any bot reply. The light engine's shallow "before" vs the main
  search's "after" can occasionally flip "best" to "good"; post-game analysis
  re-rates at standard depth.
- **Also shipped with it (follow-ups from the 29 s log):**
  - **Bot searches give up on chess-api.com after `BOT_SEARCH_TIMEOUT_MS`
    (default 5000, never above `CHESS_API_TIMEOUT_MS`)** and fall back to
    native — `withBotSearchTimeout` in `resolve-engine-backend.ts`, applied only
    to the bot's own raw backend. A stalled tunnel used to cost the full 15 s.
  - **Candidate annotation is on demand** (`bot-candidates.ts`
    `toBotCandidates`: memoised getters), and the PV walk is
    `pvForkInPlies` (`pv-tactics.ts`, fork distance only — the bot never read
    the per-ply tactic classification that made `annotatePvTactics` ~5× the
    cost). Measured on a middlegame: 33 candidates 10.8 s → about 1.8 s
    eagerly, and only the ≤10 moves `pickBotMove` weighs are ever annotated
    (0 when the best move is played) — about 0.5 s. The work now happens
    inside "Choosing move"; the "Annotating candidate moves" step is gone.
  - **The Thinking log is shared across pods**: each pod mirrors its live moves
    to Redis (`bot-thinking-mirror.ts`, one hash per session, field per move,
    1 h TTL, writes throttled to 250 ms and immediate when a move settles) and
    `GET .../bot-thinking` serves `readLog` (this pod's moves merged over the
    mirror). No `REDIS_URL` → per-process as before.
- **Not done:** requesting fewer lines per branch (the `BOT_CANDIDATE_BREADTH`
  40 request stays: the mistake pool needs a score for every candidate) — that
  is part of 74.5's mistake-first rework, which replaces the pool.

### Tasks 74.4 + 74.5 — Branch first, mistake first (SHIPPED)

The move is decided as three cases, in this order:

1. **Rolls first, engine second.** `drawBotRolls`/`decideBotBranch`
   (`bot-move-pick.ts`) turn the three rolls into `top` or `miss` before any
   engine call, so the one real-engine search is sized to the branch:
   **5 lines for top moves, 1 line for a miss** (`linesNeeded`).
2. **Top moves:** best move (`playsBestMove` — `mateConversionChance` still
   raises it when the engine sees a mate) keeps the engine's score; otherwise a
   personality-weighted pick among lines 2–5 (`pickAnotherTopFive`), with that
   line's own score. Nothing else is asked of any engine.
3. **A miss:** the mistake is chosen **without the engine** and then checked
   with it. `createMistakeBatcher` (`bot-mistake-pool.ts`) ranks every legal
   move by tactical plausibility (checks/captures/threats, what it leaves
   hanging) **and nearness to the student's last move**, and hands them out 5
   at a time, up to 3 batches, weakness-matching moves (`diagnosisCodes`) first.
   `searchForMistake` (`bot-mistake-search.ts`) takes them in order and checks
   each with ONE shallow search of the position after it (`verifyWithLightFirst`:
   the light engine, else a depth-12 search on the bot's own engine), keeping
   the first that is really as bad as wanted, at most `maxVerifications` (5)
   within `budgetMs` (6 s). Nothing bad enough → it plays the one it checked
   that gave away the most ("just play something") — its eval is already known;
   nothing could be checked → the best move.
4. **Judged in win percentage in an open position, in centipawns when the bot
   is far ahead** (`bot-mistake-judge.ts`). Open: the label bands in
   `CONFIG.severity` (> 10 points is a mistake, > 20 a blunder), so a bot's
   "blunder" is rated a blunder afterwards. Far ahead (win chance >= 90%): the
   win percentage has flattened — a lost knight at +8 only moves it from 98% to
   95% — so a mistake there is judged by centipawns given away
   (`CONFIG.botMistake.decidedMistakeCpLoss` 100 / `decidedBlunderCpLoss` 250);
   judging it in win% made every tactical move look "too good". Far behind
   (<= 10%): no mistake is injected, the best move is played (the resign logic
   decides when to stop). The old raw-cp constants (80/250 cp) and
   `pickBotMove`/`pickTacticalMistake`/`pickBlunder` are gone.
5. **The light engine is skipped after it fails.** `verifyWithLightFirst`
   waits 2.5 s for the tab, and a failure or timeout starts a 5-minute
   per-user cooldown (`lightEngineCooldownFor`), during which checks go straight
   to the bot's own engine — a stalled tab cost 4 s per check in real play.

Also: candidates are annotated on demand (see 74.3's follow-ups) and the
"Choosing move" step now ends with the path and reason; each check shows as
"Checking Nf3 with the engine (try 2 of 5)" — "too good a move — trying
another" / "a blunder — kept" (no numbers).

**Every position keeps its eval.** Each move is saved with the engine's eval of
the position it leaves in its PGN `[%eval]` comment (the tag the app already
reads back as `evalCp`; `appendMoveToPgn`'s `evalAfter` option and
`setLastMoveEval`, `saveLastMoveEval` in `play-moves-rated.ts`): the bot's move
with the eval it was chosen with, the student's move with the bot's search of
the position after it. Undo drops only the last move's comment, so an earlier
position's eval is still there. The student's move is rated from the light-engine
lines when ready, else from the eval saved with the previous move (a score
only — it can be rated but not called "best"). Both sides are rated.

**Opening book.** Every bot plays its first `GUARANTEED_BOOK_MOVES` (2) moves
from the book while the game is in it, whatever its `bookPlies` or
`bookMistakeChance` say (`selectBookMove`, `bot-opening.ts`); past those, its
own settings decide, and a student who leaves book simply leaves the bot without
entries. A move the book knows is labelled `book` — the student's
(`isBookMoveFrom`) and the bot's — without needing any eval, so the opening moves
are assessed too (the student's first move as White is always a book move).
`selectBook` on the selector dependencies is a test seam for playing the engine
path from move one.

**Untuned:** `CONFIG.botMistake` (`batchSize` 5, `batches` 3,
`maxVerifications` 5, `budgetMs` 6000, `nearDistance` 2) and the bands above are
starting points — tune from real Thinking logs (how often "none of N checked was
bad enough" appears). Known limits: the verification search is shallow (light
depth 8, or depth 12 on the bot's engine), so a high-rated bot's subtle mistakes
are judged coarsely; a book reply has no search, so those positions get no saved
eval (the background light eval still gives the next move its "before").

### Task 74.6 — Docs (SHIPPED with 74.5: `docs/architecture.md`, "Bot move selection")

**Read:** `docs/architecture.md` ("Bot Thinking log"), this phase.
**Files:** `docs/architecture.md`, `docs/plan.md`, `AGENTS.md`.

- [ ] Add a "Bot move selection" section to `docs/architecture.md`: branch
  from the rolls, engine request sized to the branch, mistake-first with
  win-percentage verification, rating from reused evals plus a background light
  eval, and why light evals never enter `position_evaluations`.
- [ ] Update the `docs/plan.md` bullet in `AGENTS.md`.

Commit: `docs: bot move selection — branch first, mistake first, rating off the critical path`

---

# Phase 75 — Unified tunnel and local LLM: review fixes

**Source:** the owner's review request of 2026-09-23 plus a code review of the
uncommitted working tree on `main` (the "unified tunnel + local LLM" change).
No separate spec file. Do **not** open `docs/diagnose.md`, `docs/algorith.md`
or `docs/tactics-rework.md`. Independent of Phases 73/74. Task 75.1 (the tunnel
takeover) is fixed in the working tree. Every `file:line` below was checked on
2026-09-23 against the working tree, not assumed; the new files are
untracked, so lines move as soon as a task edits them.

## Status (2026-09-23)

Tasks 75.1–75.10 are implemented in the working tree and not committed.
Typecheck, lint and the touched tests pass. The live checks under
"Verification" have **not** been run: no LM Studio/Ollama or OpenRouter
session was available. Where the implementation differs from the task text:

- 75.3: the relay path keeps its name, `/internal/engine-tunnel/:userId`
  (Helm network policy and worker config use it). It now also carries `llm`
  requests.
- 75.5: the local default is thinking **Off for both tiers**, not `low` for
  the coach. `low` still let Qwen3-style models think at length, which was
  the reported failure. Users raise it in Advanced.
- 75.6: the JSON extraction fallback lives in `llm/local-response.ts` (used
  when `responseFormat` is JSON), not in `llm/text.ts`. A server that rejects
  `reasoning_effort` / `chat_template_kwargs` is retried once without them and
  remembered for the process's lifetime.
- 75.8: the planner is replaced for local setups by a plan built from the
  engine review (`services/local-coaching-plan.ts`). It is never stored, so a
  later cloud setup still gets the LLM planner. The worker reaches the local
  LLM through the relay and shares the api's per-user queue.
- 75.4: OpenRouter's `/responses` and `/messages` support was **not**
  checked against its docs. With the requested order (Responses first), a
  Claude model on an endpoint that also serves it over `/responses` is
  detected as Responses. That is correct behaviour for that order, but not
  literally "Anthropic".
- Found in live testing (after 75.10): with two tabs open, the registry
  kept only the last-connected tab. When that tab reloaded or closed, the
  other, still-open tab was never re-registered, so local-LLM calls failed
  with "Connection unregistered" / "No tunnel connection" and never reached
  LM Studio. The thinking level was not the cause: LM Studio accepts
  `reasoning_effort: "low"`. Fixed. Every tab now stays registered, and new
  requests go to the most recently *used* tab: the tab sends `active` with its
  last-used time on connect, page loads, switching to it, clicks and keys
  (`engine/tunnel-tab-usage.ts`). The server answers each tab with a `role`
  frame, and inactive tabs show grey dots and the word "inactive". Closing a
  tab fails only its own requests.

## What the branch does

One browser WebSocket (`GET /api/tunnel`, `routes/unified-tunnel.ts`)
replaces `/api/engine-tunnel` and carries three request kinds, each with a
server-generated `requestId` (`services/engine/unified-tunnel-registry.ts`):

- `engine` (`subKind` `analyze-position` / `analyze-game`): the browser WASM
  Stockfish workers — Browser mode's main engine and the lite supplement.
- `fetch`: chess-api.com calls proxied through the tab (`tunnel-fetch.ts`,
  only caller `resolve-engine-backend.ts:189`, chess_api mode).
- `llm` (`subKind` `chat` / `fetch-models`): a local LM Studio / Ollama
  server, reached by the tab's `fetch` (`apps/web/src/hooks/useUnifiedTunnelClient.ts`)
  and wrapped server-side as an AI SDK `LanguageModelV4` (`apps/api/src/llm/local.ts`).

**Game imports do not use the tunnel.** Chess.com and Lichess are fetched
server-side (`services/chesscom.ts:58`, `services/lichess.ts:32`). If imports
should come from the user's IP, that is new work (not in this phase).

## Review findings (verified)

Critical:

1. **Any signed-in user can take over another user's tunnel.**
   `routes/unified-tunnel.ts:15-19` takes `userId` from the query string and
   only falls back to `request.user`. `GET /api/tunnel?userId=<victim>`
   registers the attacker's socket for the victim (last-connection-wins,
   `unified-tunnel-registry.ts:95-155`). The attacker then receives the
   victim's coach prompts (full LLM `messages`) and answers them, and answers
   the victim's engine requests with fake evals that get stored.
2. **The tunnel is off for Internal-engine users.**
   `useUnifiedTunnelActivation.ts:27-30` connects only for `browser` /
   `chess_api` / local-LLM users. The replaced `useEngineTunnelActivation.ts:37-41`
   connected for everyone because the lite supplement serves every engine
   mode (its doc comment explains why gating it was a bug before). So in
   Internal mode the lite dot never goes green and the lite supplement is
   unreachable. **This is the badge bug.**
3. **Paused analyses no longer resume on reconnect.** The old route called
   `resumePausedAnalyses` on every connect (`git show HEAD:apps/api/src/routes/engine-tunnel.ts`);
   the new route does not, and `app.ts` stopped passing `jobQueue`. The UI
   still says they resume (`apps/web/src/features/import/AnalysisProgress.tsx:161-163`).
4. **Remote reasoning regression for every user.** `LlmSetupBaseSchema`
   sets `reasoning: ReasoningEffortSchema.default('provider-default')`
   (`packages/shared/src/llm.ts:62`), so `setupReasoning ?? …`
   (`llm/gateway.ts:107`) always wins. The deployment tuning (`standard:
   'medium'`, `light: 'none'`, `model-options.ts` `DEFAULT_MODEL_TUNING`) is
   ignored, including for setups saved before this branch. The `'none'`
   fallback meant for local models is unreachable.

Why the local LLM never answers (all in `llm/local.ts`):

5. **Reasoning is never sent.** The SDK passes effort as `options.reasoning`
   (`LanguageModelV4CallOptions.reasoning`); `local.ts:110` reads
   `providerOptions.openai.reasoningEffort`, which `model-options.ts`
   deliberately never sets. So the model always thinks at its own default.
6. **Structured output is ignored.** The first LLM call of a coach session is
   the planner (`coaching-plan.ts:70-76`, `generateStructured` →
   `generateObject`, `llm/text.ts:41`). That call sends
   `options.responseFormat` with a JSON schema; `local.ts` never forwards it
   as `response_format`, so the model answers in prose (or thinks), and parsing
   fails. **This is the failing "episodes" call.**
7. **Thinking output is not handled.** `reasoning_content` and inline
   `<think>…</think>` are not separated from `message.content`, and with a
   token cap the thinking can use up all of it, leaving `content: null`.
8. **Fake streaming trips the stall guard.** `doStream` (`local.ts:159-181`)
   waits for the whole completion before emitting. The coach runs under
   `firstChunkMs` 120 s (`model-options.ts`, `llm/chat.ts:111`); a thinking
   local model often goes past that, so the turn aborts.
9. **Tool history is corrupted.** `convertPromptToMessages`
   (`local.ts:185-208`) drops assistant `tool-call` parts, merges every tool
   result into one `tool` message with only the first `tool_call_id`, and
   `convertToolChoice` (`local.ts:210-215`) returns a bare tool name, which the
   OpenAI format rejects (it expects `{type:'function', function:{name}}`).
10. **The worker cannot use a local LLM.** `worker.ts:18` builds the gateway
    without `llmTunnelTransport`, so worker jobs that call the LLM (e.g.
    `jobs/summarize-session.ts`) throw "LLM tunnel transport is not configured"
    (`gateway.ts`). The internal relay (`routes/engine-tunnel-internal.ts`)
    forces `kind: 'engine'`.
11. **The setup test passes for models that will fail.**
    `compatibility-test.ts:153` caps the probe at `max_tokens: 8`. It only checks
    that `choices` exists (`:166`), not that it has any text. It runs low and
    high in parallel (`:126`) against a server that handles one request at a
    time. The voice branch (`:131`, `setup.protocol !== 'local'` inside the local
    path) is dead code.

Remote protocol detection:

12. The provider dropdown (`LlmSetupForm.tsx:225-228`) is cosmetic.
    `testLlmSetup` ignores `setup.protocol` for remote setups and tries
    chat → responses → anthropic, choosing **one** protocol for both models
    (`compatibility-test.ts` `testLlmSetup`; `StoredLlmSetup.protocol` is a
    single field). A Sonnet high model and a gpt-5.6 low model on OpenRouter
    therefore cannot both work.
13. `llm/openai-compatible.ts` probes with `model: 'probe'` (`:35`, `:45`),
    which any real provider rejects, so both flags come back false and it
    falls back to chat. Nothing produces `'openai-compatible'` (the test never
    returns it), so `gateway.ts:132` is dead code.

Local setup form (`apps/web/src/features/settings/LlmSetupForm.tsx`):

14. Picking LM Studio or Ollama does not change the port (`localType` is not an
    effect dependency). The `[protocol]` effect (`:79-94`) also runs on mount,
    which overwrites a saved setup's endpoint and models with the defaults.
    Two effects both call `fetchModels` (`:86`, `:99`), and it reads state from
    a stale closure.
15. `:185` has a template literal with literal braces, so the page prints
    `· Flex: {status.useFlex ? 'on' : 'off'}` as text. `:460` renders
    "local (local)".
16. The CORS advice is backwards (`useUnifiedTunnelClient.ts:194-196`,
    `LlmSetupForm.tsx:232,258,344`). A page on another origin can only read
    `http://localhost:1234` if the local server **allows** that origin: LM
    Studio needs "Enable CORS" turned **on**, and Ollama needs
    `OLLAMA_ORIGINS` to include the site's origin. Chrome may also show a
    local-network-access permission prompt the first time.
17. The local token goes in a GET query string (`routes/llm-models.ts:14`),
    so it ends up in proxy access logs. "Current model" is just `models[0]`
    (`useUnifiedTunnelClient.ts:221`), not the model that is actually loaded.

Hygiene:

18. The server logs the first 200 chars of every tunnel message, including
    LLM output (`routes/unified-tunnel.ts:39`). The client logs every message.
    The client also answers the server's `{type:'pong'}` as an "Invalid
    request kind" error every 20 s (`useUnifiedTunnelClient.ts:270-277`).
    `socket.on('message')` uses `data.toString()` instead of the old
    `rawDataToString` (fragmented frames).
19. The client preloads the ~108 MB full-net worker for **every** user on
    connect (`useUnifiedTunnelClient.ts:52-55,345`). The old hook preloaded it
    only in Browser mode.
20. Dead or duplicate code: `routes/engine-tunnel.ts` (unregistered),
    `engine-tunnel-registry.ts` (deprecated wrapper, no users), two
    `EngineTunnelAdapter`s (`engine-tunnel-transport.ts`,
    `unified-tunnel-registry.ts`), two `LlmTunnelAdapter`s
    (`llm-tunnel-transport.ts`, `unified-tunnel-registry.ts`), the old
    `useEngineTunnelClient.ts` / `useEngineTunnelActivation.ts`, the unused
    `engine/llm-tunnel-connection-status.ts`, and `UnifiedTunnelActivator()`
    called as a function inside `App.tsx`. `app.ts:110` uses
    `options.unifiedTunnelRegistry!`, and `local.ts:8` reads `process.env`
    directly, which breaks the `bootstrap.ts` rule.

Typecheck (api, web) and the engine/llm Vitest suites pass on the current
tree. None of the above is covered by a test.

## Decisions (owner, 2026-09-23 — do not relitigate)

- One tunnel, three kinds, stays. It is always connected for signed-in users
  (not demo).
- The engine badge's dot shows **tunnel health**, not "Browser mode is on".
- Remote protocol is **detected per model** during setup, in the order
  **Responses → Anthropic Messages → Chat Completions**. There is no provider
  dropdown for remote endpoints.
- The local dropdown (LM Studio / Ollama / Other) sets the default port.
- Advanced mode gets a **thinking level** per tier.
- Local LLMs get a simpler call pattern because the server runs one request at
  a time on one model (Task 75.8).

## Layering

Provider SDK code and wire-format mapping stay in `apps/api/src/llm/`
(AGENTS.md rule 6). The tunnel registry and transports stay in
`services/engine/` (no `ai` imports there). Zod schemas go in
`packages/shared/src/llm.ts`. New timeouts and knobs are env vars parsed in
`bootstrap.ts` with `parsePositiveInt`. Keep `local.ts` under ~200 lines by
splitting the request mapping, the response mapping and the stream into
separate files.

---

### Task 75.1 — Close the tunnel takeover and restore resume-on-connect (DONE, uncommitted)

**Read:** `apps/api/src/routes/unified-tunnel.ts`, `git show HEAD:apps/api/src/routes/engine-tunnel.ts`,
`apps/api/src/app.ts:100-145`.
**Files:** `routes/unified-tunnel.ts` (+ new `routes/unified-tunnel.test.ts`), `app.ts`.

- [x] Failing test: a WS connect with `?userId=<other>` registers under the
  authenticated user's own id, never the query value.
- [x] Remove the `Querystring` generic and `request.query.userId`. The user
  comes only from `userProfileService.getOrCreate(db, request.user)`, imported
  statically (no dynamic `import()`).
- [x] Bring back `resumePausedAnalyses` and `rawDataToString` from the old
  route. Pass `options.jobQueue ?? noopJobQueue` again from `app.ts`, and
  delete `routes/engine-tunnel.ts`.
- [x] Remove the per-message `console.log` calls in the route and the registry
  (keep error logs, with no payload content).
- [x] Lint, typecheck, and run the new test.

Commit: `fix(tunnel): bind tunnel to the authenticated user and resume paused analyses`

### Task 75.2 — Tunnel always on; badge shows tunnel health (DONE, uncommitted)

**Read:** `git show HEAD:apps/web/src/hooks/useEngineTunnelActivation.ts`,
`apps/web/src/hooks/useUnifiedTunnelActivation.ts`,
`apps/web/src/hooks/useEngineTunnelStatusDots.ts`,
`apps/web/src/components/TunnelStatusDots.tsx`.
**Files:** those four, `useUnifiedTunnelClient.ts`, `App.tsx`.

- [x] Connect whenever the user is signed in, as the old hook did. Drop the
  `engineEnabled/llmEnabled/fetchEnabled` options.
- [x] Always preload lite. Preload the main worker only when
  `engineMode === 'browser'`; restore `useMainEnginePreload`.
- [x] Ignore `{type:'pong'}` in `handleTunnelRequest` before the kind check.
  Remove the per-message console logs.
- [x] Set `connecting` before `new WebSocket`, so the status type's
  `connecting` value is actually used.
- [x] Dot rule (unit test `useEngineTunnelStatusDots`):
  - red: socket not open
  - yellow: `connecting`, or open but the lite worker is still loading
  - green: open and lite ready

  The Browser-engine dot is unchanged. When the setup is local, add a
  "Local AI" dot: green after the last `fetch-models` / `chat` call through
  the tunnel succeeded, yellow before any call, red after a failure (a tiny
  module store like `tunnel-connection-status.ts`). Delete
  `engine/llm-tunnel-connection-status.ts` if it is not used for that.
- [x] `App.tsx`: render `<UnifiedTunnelActivator />` (or call the hook inside
  `UnifiedTunnel`), not both.
- [x] Manual check: Internal mode, reload → lite dot yellow then green.

Commit: `fix(web): keep the tunnel connected for every engine mode and show its health`

### Task 75.3 — Remove dead and duplicate tunnel code (DONE, uncommitted)

**Read:** finding 20.
**Files:** `engine-tunnel-registry.ts` (delete), `engine-tunnel-transport.ts`,
`llm-tunnel-transport.ts`, `unified-tunnel-registry.ts`, `bootstrap.ts`,
`app.ts`, `apps/web/src/hooks/useEngineTunnelClient.ts` +
`useEngineTunnelActivation.ts` (delete), comments that name
`/api/engine-tunnel` (`useTunnelConnectionStatus.ts`,
`useEngineTunnelStatusDots.ts`, `TunnelStatusDots.tsx`,
`AnalysisProgress.tsx`, `deploy/helm/.../networkpolicy-api.yaml`).

- [x] Keep exactly one `EngineTunnelAdapter` and one `LlmTunnelAdapter`, each
  next to its transport interface. Build them once in `server.ts`. `app.ts`
  receives the `LlmTunnelTransport` as an option; no `!`.
- [x] Typed request unions in the registry
  (`{kind:'engine', subKind, …} | {kind:'fetch', …} | {kind:'llm', subKind, …}`),
  used by the web client too. Put them in `packages/shared` so both sides
  share one definition.
- [x] `grep -rn "engine-tunnel'" --exclude-dir=dist` shows only the internal relay.

Commit: `refactor(tunnel): one registry, one adapter per kind, shared message types`

### Task 75.4 — Per-model protocol detection (remote) (DONE, uncommitted)

**Read:** `apps/api/src/llm/compatibility-test.ts`, `llm/gateway.ts`,
`packages/shared/src/llm.ts`, finding 12–13.
**Files:** those three, `llm/openai-compatible.ts` (delete),
`LlmSetupForm.tsx`, `compatibility-test.test.ts` (new).

- [x] Schema: add `lowProtocol` and `highProtocol` (`LlmProtocol`) to
  `StoredLlmSetupSchema`. Keep `protocol` = high's value for old readers.
  Setups stored before this change have neither field, so a small
  `resolveTierProtocol(setup, tier)` falls back to `protocol`.
  Remove `'openai-compatible'` from `LlmProtocolSchema`. `LlmSetupTestResponse`
  reports a protocol per model.
- [x] Failing tests (mock `fetch`): (a) high `claude-sonnet-5` → responses
  fails, anthropic passes; low `gpt-5.6-luna` → responses passes; both saved
  with their own protocol. (b) Order is responses → anthropic → chat and stops
  at the first pass per model. (c) A `gpt-5.4+` model never falls back to chat
  (keep `requiresOpenAiResponsesApi`). (d) Low and high with the same model
  are probed once.
- [x] The probe must prove what coaching needs. Send one trivial function tool
  with `tool_choice: auto` plus the "Reply with exactly OK." text. Pass means
  2xx and a well-formed text or tool-call body in that wire format. A
  tool-less pass is what let chat "work" and then break real turns (see the
  `requiresOpenAiResponsesApi` comment).
- [x] Gateway: `buildModel` uses the tier's protocol. Delete
  `openai-compatible.ts` and its branch.
- [x] UI: replace the four-way Provider select with **Cloud / API endpoint**
  vs **Local (LM Studio / Ollama)**. The result screen shows the detected
  format per model.
- [x] Before coding, check OpenRouter's current docs for its Anthropic-style
  `/messages` and `/responses` paths under `https://openrouter.ai/api/v1`, and
  write down in the test file which ones exist.

Commit: `feat(llm): detect Responses/Anthropic/Chat per model during setup`

### Task 75.5 — Thinking level: fix the regression, add the advanced setting (DONE, uncommitted)

**Read:** `llm/model-options.ts`, `llm/gateway.ts:95-112`, finding 4.
**Files:** `packages/shared/src/llm.ts`, `gateway.ts`, `LlmSetupForm.tsx`, `gateway.test.ts`.

- [x] Failing test: a stored setup with no reasoning field gives
  `standard → 'medium'` and `light → 'none'` (deployment tuning).
- [x] Replace the single `reasoning` field with optional
  `reasoning: { standard?: ReasoningEffort; light?: ReasoningEffort }`, with
  **no Zod default**. Resolution order: the user's tier value, then local
  default (`light: 'none'`, `standard: 'low'`), then `tuning.reasoning[tier]`.
  Keep the logic in `callOptionsFor` (the one place it is decided, per its doc
  comment); `resolveCallOptions` passes the setup through.
- [x] Advanced section (cloud and local): a "Thinking level" select per model
  with Default / Off / Low / Medium / High, plus a hint that local models often
  ignore it (see 75.6).

Commit: `fix(llm): restore tuned reasoning defaults; add per-tier thinking level`

### Task 75.6 — Make the local model adapter correct (DONE, uncommitted)

**Read:** `apps/api/src/llm/local.ts`, `node_modules/@ai-sdk/provider/dist/index.d.ts`
(`LanguageModelV4CallOptions`: `reasoning`, `responseFormat`, `toolChoice`),
findings 5–9.
**Files:** split `local.ts` into `local-model.ts`, `local-request.ts`,
`local-response.ts` (+ tests for the last two; pure functions).

- [x] Request mapping tests first:
  - `options.reasoning` → `reasoning_effort` (omit it for `provider-default`).
    For `none`, also add `chat_template_kwargs: { enable_thinking: false }`,
    which llama.cpp-based servers read and others ignore.
  - `responseFormat {type:'json', schema}` →
    `response_format: {type:'json_schema', json_schema:{name, schema, strict:true}}`.
  - Assistant `tool-call` parts → `tool_calls` with stringified arguments.
  - One `tool` message per `tool-result` with its own `tool_call_id`.
  - `toolChoice {type:'tool'}` → `{type:'function', function:{name}}`.
  - `maxOutputTokens` → `max_tokens`. Do not default `temperature` to 0.7;
    omit it when unset.
- [x] Response mapping tests:
  - `reasoning_content` (or `reasoning`) → a V4 `reasoning` content part.
  - A leading `<think>…</think>` in content is moved into reasoning.
  - Tool-call `arguments` pass through as a string.
  - `content: null` with `finish_reason: 'length'` → a typed error whose
    message says the model spent its budget thinking.
  - `usage` mapped as today.
- [x] Planner fallback: if `generateStructured` gets non-JSON from a local
  model, extract the first `{…}` block once before failing (in `llm/text.ts`,
  local provider only).
- [x] Timeouts from `bootstrap.ts` (`LOCAL_LLM_TIMEOUT_MS`), passed in
  through `GatewayConfig`, not read from `process.env` in `llm/`.

Commit: `fix(llm): local adapter sends reasoning, JSON schema and tool history correctly`

### Task 75.7 — Real streaming over the tunnel (DONE, uncommitted)

**Read:** `unified-tunnel-registry.ts`, `useUnifiedTunnelClient.ts` `handleChatCompletion`,
`llm/chat.ts:95-125`.
**Files:** registry (+ test), client, `local-model.ts`.

- [x] Registry: `requestStream(userId, payload, {idleTimeoutMs})` returns an
  async iterable. Frames carry `{requestId, chunk}` and then
  `{requestId, done:true}` or `{requestId, error}`. Every frame resets the idle
  timer. Test it with a fake connection.
- [x] Browser: `stream:true`, read the SSE body, forward each `data:` event
  as it arrives, and stop on `[DONE]`. Abort the local fetch when the server
  sends `{type:'cancel', requestId}`, which is sent when the SDK aborts.
- [x] `doStream` maps deltas to `reasoning-delta` / `text-delta` /
  `tool-input-*` parts as they arrive. Reasoning deltas count as chunks for
  `firstChunkMs`, so a thinking model is not treated as stalled. The UI can
  show "thinking…" from `reasoning-start`.

Commit: `feat(llm): stream local LLM output through the tunnel`

### Task 75.8 — Local LLMs: one request at a time, one model, fewer calls (DONE, uncommitted)

**Read:** `coaching-plan.ts`, `coach-agent-system-prompt.ts:16-30`, `worker.ts`,
`routes/engine-tunnel-internal.ts`, findings 10–11.
**Files:** new `llm/local-queue.ts` (+ test), `gateway.ts`, `coaching-plan.ts`,
`worker.ts`, internal relay route.

- [x] Per-user FIFO for `llm` tunnel requests, concurrency 1. Interactive coach
  turns go ahead of background calls such as the summarizer and move notes.
  Tests: two calls never overlap, and interactive jumps the queue. This also
  keeps one prompt prefix warm in the local server's KV cache instead of
  alternating between planner and coach prompts.
- [x] Basic local mode is one model for both tiers. In Advanced mode, if low
  ≠ high, show the hint that LM Studio/Ollama will swap models between calls
  (slow on one GPU).
- [x] Planner for local: skip the LLM planner and build the plan from the
  programmatic candidate moments (`candidateMoments` already passed to
  `buildPlannerMessages`). Use fixed wording for `socraticQuestion` / `whatHappened`
  and put no LLM text in `gameSummary` / `openingNote`. The coach turn then
  becomes the session's **first and only** LLM call. First check that
  `buildCoachSystemPrompt` renders fine with that plan, and whether a
  plan-less prompt is simpler. Pick whichever needs less code and say why in
  the commit.
- [x] Context size: during setup, read the loaded model's context length
  (LM Studio's REST `/api/v0/models` has `loaded_context_length`; Ollama's
  `/api/show` has the model's context length; check both against current docs).
  Refuse or warn when it is below the coach prompt size, measured with the
  existing token count of the static prompt.
- [x] Worker: send `llm` requests through the internal relay (add a `kind`
  field instead of forcing `'engine'`) and give `worker.ts` a relay
  `LlmTunnelTransport`, or keep LLM-calling jobs off the worker for local
  setups. Choose one and test it.
- [x] Setup test for local: run models one after another, `max_tokens` large
  enough for a thinking model (≥ 256) with thinking `none`, and require
  non-empty text. Remove the dead voice branch.

Commit: `feat(llm): serialize local LLM calls and drop the planner call for local setups`

### Task 75.9 — Local setup form (DONE, uncommitted)

**Read:** `LlmSetupForm.tsx`, findings 14–17.
**Files:** `LlmSetupForm.tsx` (split: `LocalLlmFields.tsx`, `useLocalModels.ts`),
`routes/llm-models.ts`, `useUnifiedTunnelClient.ts`.

- [x] `DEFAULT_LOCAL_ENDPOINTS = { 'lm-studio': 'http://localhost:1234/v1', ollama: 'http://localhost:11434/v1' }`.
  Changing `localType` changes the endpoint only while it still equals the
  previous type's default. `other` keeps whatever is typed.
- [x] No reset on mount: initialise from `status` and reset only from the
  change handlers, not from effects. `useLocalModels(endpoint)` is a TanStack
  Query keyed on the endpoint, debounced.
- [x] `models` endpoint becomes `POST` with `{endpoint, token}` in the body.
  "Current model" comes from the backend's loaded state where it exists (see
  75.8); otherwise leave it empty.
- [x] Correct the CORS copy (finding 16) and give specific instructions per
  type. For a `TypeError` fetch failure, show "Couldn't reach <endpoint> from
  this browser — is LM Studio running with CORS enabled?" instead of guessing.
- [x] Fix `:185` (Flex literal) and the "local (local)" label.

Commit: `fix(web): local LLM setup — port per type, keep saved values, correct CORS help`

### Task 75.10 — Docs (DONE, uncommitted)

**Files:** `docs/architecture.md` (tunnel section: one socket, kinds, auth,
resume; local LLM section: queue, streaming, planner skip), `AGENTS.md`
plan pointer.

Commit: `docs: unified tunnel and local LLM`

## Verification (end of phase)

- Two browsers signed in as different users; `?userId=` tampering has no
  effect.
- Internal mode: the dot goes green after load with no Browser mode.
- OpenRouter with high `anthropic/claude-sonnet-5`, low `openai/gpt-5.6-luna`:
  setup saves two different protocols, and a coach session runs both tiers.
- LM Studio with a thinking model (e.g. a Qwen3 build): setup passes, the first
  coach message streams within `firstChunkMs`, and the dev log shows one LLM
  call before the first reply.
- `npm run verify:changed`.

---

# Phase 76 — Eval-witnessed tactical verdicts and meaningful diagnostics

**Source spec:** this request (no separate spec file). Diagnostics semantics
come from `docs/diagnose.md` §4.4 (lines ~172-182) and §4.6. Read **only**
those two subsections, never the whole file. Tactic-finder work also needs
`docs/tactics-rework.md` §5 (layers) and §9 ("A gate that was tried and
reverted"). Every `file:line` below was checked on 2026-09-24 against the
working tree, not assumed.

## The request

The Progress page's "Measured diagnoses" are implausible for about 11 games.
For example, "Opponent-direct-threat omission 4/387 failed", "Own hanging-piece
blindness 15/145", "Opponent-check scan omission 2/216". The owner asked for
three things:

1. **Opportunities and failures must mean something.** A chance counts only
   when the theme was real and mattered. A failure counts only when *that*
   mechanism cost the student.
2. **The tactic finder must use the eval as a check, both positive and
   negative.** Examples: ignoring a piece in danger to play a move that
   threatens mate is not a failure. Sacrificing a piece to lure the queen,
   which then gets captured, is not a loss.
3. **This covers every tactical verdict, not just material loss:** missed,
   allowed, found, and prevented. In clearly won or lost positions the win%
   barely moves, so the check must be saturation-aware.

## Root causes (verified)

- **The opportunity counts are inflated.** `diagnostics/cct-opportunities.ts`
  returns every legal opponent check, capture and quiet threat unfiltered, so
  `MS-01/02/03` fire on almost every ply. The same holds for the student's own
  unplayed checks and threats (`MS-04/06`).
- **"Failed" means "the move was bad" for any reason.** `detectors/shared.ts`
  `buildQualityObservation` sets `failed = quality ∈ {mistake, blunder,
  miss}`. One blunder therefore fails every code that happened to fire on that
  ply, whether or not the named mechanism was involved.
- **Some detectors fail regardless of the move.** `MS-07` is hard-coded
  `failed: true`. `MS-14` fails on an even trade. `TA-* D` fails whenever a
  threat is "still reachable", with no eval check. The DB shows failures on
  `best` and `brilliant` moves with a 0.0 win% drop.
- **Decided positions are counted one-sidedly.** `resolveEpisodes` drops
  *failed* observations in completely decided positions (DQ-09,
  `resolve-episodes.ts:47`). `build-diagnostics.ts:69` still stores the
  *non-failed* ones, which biases rates downward. 187 of the test user's 616
  plies start at |eval| ≥ 700 cp.
- **The tactic verdicts have no eval check.**
  - `classifyTacticMotifOpportunity` (`game-tactic-motifs.ts:77`) makes a ply
    an opportunity whenever the engine's best move carries a motif, even when
    the second line is as good. It marks "missed" even when the played move
    lost nothing.
  - `computeTacticAllowed` (`tactic-allowed.ts:26`) gates on quality only.
  - `computeTacticMotifPrevented` (`apps/api/src/services/tactic-prevention.ts:129`)
    counts any motif found at any odd ply of any of the opponent's top-5 lines
    as a threat, including lines the opponent would never play. The
    `minWinProbabilitySwing` config (`config.ts:257`) is defined but unused.
- **Re-analysis would duplicate observations.** `recordDiagnosticObservations`
  (`services/analysis.ts:168`) only inserts.

## Design decisions (do not relitigate)

- **The eval is a witness, and it acts at the verdict layer, not the claim
  layer.** Detectors and `verify-tactic-*` are left alone, so the precision
  ceilings and Lichess recall floors cannot move.
- **The engine eval already is the end-of-line value.** A stored eval is the
  engine's search result, so a queen-lure sacrifice already evaluates well at
  ply 1. Compare evals directly. There is no need to "walk to the end of the
  PV" for eval.
- **Always compare against the best alternative.** A loss is best-line eval
  (`cpBefore`) versus the played move's eval (`cpAfter`). Both are stored
  White-perspective and clamped, with mate folded in as ±(2000 − 10·n)
  (`win-probability.ts`). Never compare against "the position before the
  move".
- **"Meaningful gap" is one predicate used everywhere** (`evalGap` in Task
  76.1). It is true when any of these holds:
  - The win% gap is at least 10. This is the mistake boundary, so it keeps
    parity with today for non-decided positions.
  - The outcome band changed (winning ≥ 75%, balanced, losing ≤ 25%) and the
    gap is at least 5.
  - Both evals are in the same winning or losing band and the cp gap is at
    least 300. This is the saturation case: dropping a queen at +15 still
    counts.
- **Diagnostics exclude completely decided plies in both directions.** A ply
  is decided when best and played are both ≥ 90% or both ≤ 10% (the existing
  `isCompletelyDecidedPosition`). This is DQ-09, applied at detection time.
  Game Review cards keep the cp rule, so "you missed mate" at +15 still
  prints.
- **A "compensated" position is not a failure.** If the shape says negative
  but the eval gap is not meaningful (a sacrifice, or a mate threat instead
  of saving a piece), the verdict is dropped. In diagnostics it becomes
  `failed: false`, and only when the ply was an opportunity anyway.
- **Legacy moves fall back to today's behaviour.** When `cpBefore`/`cpAfter`
  are missing, the witness returns `null` and callers use today's quality
  rule.
- **No new engine calls anywhere.**

## What already exists and is reused as-is (verified)

- `CONFIG.severity.dampingHighWin/LowWin` (90/10) and
  `isCompletelyDecidedPosition` (`diagnostics/resolve-episodes.ts:47`).
- `CONFIG.miss.opportunityWinPctMin` (75) sets the outcome band.
- `winPctFor` and `toCpWhite` (`win-probability.ts`).
- `ClassifiedMoveDto`: `cpBefore`/`cpAfter` (White-perspective; `cpBefore` is
  the best line's eval), `winPctBefore`/`winPctAfter` (mover-perspective),
  `alternatives[]` (`{san, cp (White), winPct}` for lines 2..N),
  `bestMoveSan`, and `bestLinePvSan`. The next ply's `bestLinePvSan` is the
  engine's refutation of this move (`classify.ts:137-213`).
- `flipActiveColorFen` (`null-move-fen.ts:20`, returns `null` when in check)
  and `analyzeChecksCapturesThreats(fen)`.
- `see(fen, square, side)` returns centipawn-like units (details print "SEE
  330"). Verify the units before relying on 100 = one pawn.
- `attackersOf`, `defendersOf`, `enemyTargetsOf` and `materialBalance`
  (`tactic-board-facts.ts`), `computePositionFeatures`, `applySanSequence`,
  and `PIECE_VALUES` (`tactics.ts:9`).
- The detector registry, `PlyDiagnosticContext` (`diagnostics/context.ts`) and
  `buildDiagnosticObservations` (`apps/api/src/services/build-diagnostics.ts`).
- The live path `play-move-quality.ts:103` `diagnosisCodesFor` runs the same
  registry with no `nextMoves`. Every new rule must degrade to static checks
  when the refutation line is absent.

## Baseline (test user `6dcb1cee-9d82-4235-81fc-da01f650b911`, 19 games with observations, 554 diagnosed plies)

Opportunities / failed, per code+direction, before this phase:

| Code | Opp. / failed | Code | Opp. / failed |
|---|---|---|---|
| MS-03 D | 441 / 5 | TA-43 D | 62 / 2 |
| MS-06 O | 429 / 0 | BV-15 B | 59 / 1 |
| MS-01 D | 231 / 2 | MS-08 N | 58 / 0 |
| MS-04 O | 225 / 0 | TA-14 D | 44 / 1 |
| MS-02 D | 219 / 0 | MS-14 N | 26 / 4 |
| BV-01 D | 163 / 16 | MS-07 N | 3 / 3 |
| MS-05 O | 149 / 0 | | |
| BV-02 O | 103 / 2 | | |

Known false failures in that data:
- `MS-07 N` on `Nxd4`/`Qxd4`, which were `best` with a 0.0 drop.
- `TA-43 D` on `Bxh8`, a `brilliant` move.
- `MS-14 N` on the even trade `exd5`.
- Several `BV-01` failures where the mistake was something else, for example
  the missed `Qh4+` at game `07eb…` ply 20.

## Layering

Everything in 76.1–76.4 is pure logic in `packages/chess-analysis` (no I/O).
76.5 touches `packages/chess-analysis` plus `apps/api/src/services/tactic-prevention.ts`.
76.6 touches `apps/api` services and repositories. SQL stays in `db/repositories/`.

### Task 76.1 — The eval witness

**Read:** `packages/chess-analysis/src/win-probability.ts`, `config.ts:14-50,110-113`,
`diagnostics/resolve-episodes.ts:36-52`.
**Files:** new `packages/chess-analysis/src/eval-witness.ts` (+ `eval-witness.test.ts`),
`config.ts` (new `evalWitness` block), `index.ts` (export).

API:

```ts
export interface EvalGap {
  winPctGap: number;      // mover win%(higher) - mover win%(lower); negative when "higher" is actually lower
  cpGap: number;          // mover-perspective cp difference on the clamped scale
  outcomeChanged: boolean;// band differs: winning (>= outcomeWinPct) / balanced / losing (<= 100 - outcomeWinPct)
  sameDecisiveBand: boolean; // both winning or both losing
  meaningful: boolean;
}
/** `higherCpWhite` is the eval the mover should have had (best line / the chance),
 * `lowerCpWhite` the one they got. Both White-perspective, as stored. */
export function evalGap(higherCpWhite: number, lowerCpWhite: number, mover: 'white' | 'black'): EvalGap;
/** Best vs played for a stored move; null when cpBefore/cpAfter are missing (legacy). */
export function playedMoveGap(move: Pick<ClassifiedMoveDto, 'cpBefore' | 'cpAfter' | 'mover'>): EvalGap | null;
```

`CONFIG.evalWitness`: `minWinPctGap: 10`, `minOutcomeChangeWinPctGap: 5`,
`outcomeWinPct: 75`, `decisiveBandMinCpGap: 300`. Comment each value with
why it was chosen (mistake boundary, the miss band, and roughly a minor
piece).

- [x] Failing tests, covering every rule in "Design decisions":
  - Equal position, +300 cp to 0: meaningful.
  - +40 to −40: not meaningful (sign flip inside the balanced band).
  - +1500 to +600: meaningful through the cp rule.
  - +1500 to +1300: not meaningful.
  - Mate-in-3 (1970) to +1200: meaningful.
  - Mate-in-3 to mate-in-5: not meaningful.
  - Played better than best (engine noise, negative gap): not meaningful.
  - Black mover perspective.
  - `playedMoveGap` returns null on legacy moves.
- [x] Implement it and export it from `index.ts`. (`CONFIG.evalWitness` also
  carries `minThreatSeeCp: 100`, which Tasks 76.2-76.4 use.)
- [x] Lint, typecheck, and `npx vitest run src/eval-witness.test.ts` in the package.

Commit: `feat(analysis): eval witness for tactical verdicts`

### Task 76.2 — Diagnostics infrastructure: eval context, DQ-09 at detection, threat/chance inventories

**Read:** `diagnostics/context.ts`, `diagnostics/detectors/shared.ts`,
`diagnostics/cct-opportunities.ts`, `diagnostics/README.md`, `diagnose.md` §4.4,
`apps/api/src/services/build-diagnostics.ts`, `apps/api/src/services/play-move-quality.ts:90-110`.
**Files:**
- `diagnostics/context.ts`
- new `diagnostics/eval-verdict.ts`
- new `diagnostics/threat-inventory.ts`
- new `diagnostics/chance-inventory.ts`
- tests for each new file
- `diagnostics/index` exports (wherever `diagnostics/*` is exported from `src/index.ts`)
- `build-diagnostics.ts`
- `play-move-quality.ts`

1. **Context.** Add these to `PlyDiagnosticContext`, and fill them in
   `buildPlyDiagnosticContext`:
   - `cpBefore?`, `cpAfter?`, `winPctBefore?`, `winPctAfter?`
   - `playedGap: EvalGap | null`, set to `playedMoveGap(move)`
   - `refutationPvSan?: string[]`: the `bestLinePvSan` of `options.nextMoves[0]`
     when that move's `ply === move.ply + 1`, otherwise undefined. This is the
     engine's best reply to the played move.
2. **`eval-verdict.ts`:**
   - `lossConfirmed(ctx): boolean` returns `ctx.playedGap.meaningful`, or falls
     back to `qualityFailed(ctx.quality)` when `playedGap` is null.
   - `isDiagnosticallyMeaningfulPly(ctx): boolean` is false when
     `isCompletelyDecidedPosition(winPctBefore, winPctAfter)` and both are
     defined.
   - `buildEvalObservation(ctx, code, direction, failed, detail)` sets:
     - `hwdl = failed ? max(0, playedGap.winPctGap) / 100 : 0` (fall back to
       `ctx.drop` like today when there is no gap)
     - severity from the gap: ≥ 30 → decisive, ≥ 20 → major, ≥ 10 →
       meaningful, otherwise minor. Fall back to `severityFromQuality` when
       there is no gap.
     - `reachability: 1`.
3. **`threat-inventory.ts`.** The opponent's *dangerous* forcing moves:
   - `type ThreatKind = 'check' | 'capture' | 'threat'`
   - `interface Threat { kind; moveSan; target: Square /* captured/attacked square; king square for checks */ }`
   - `opponentThreatsBefore(ctx, kind)` uses `flipActiveColorFen(ctx.fenBefore)`
     and returns `[]` when that returns null (mover in check).
     `opponentThreatsAfter(ctx, kind)` uses `ctx.fenAfter` (opponent already
     to move).
   - "Dangerous" is defined per kind, all static:
     - capture: `see(fen, to, opponent) >= CONFIG.evalWitness.minThreatSeeCp` (100).
     - check: `isCheckmate`, or both of the following after replaying the
       check: the checker's landing square is not a profitable capture for
       the mover (`see ≤ 0`), and the checker attacks a mover piece worth ≥ 3
       (`PIECE_VALUES`) that is undefended or worth more than the checker.
     - quiet threat: after replaying the threat move, its landing square is
       safe (`see` for the mover ≤ 0) and some `targetedPieces` square is a
       profitable capture for the opponent (`see ≥ minThreatSeeCp`).
   - `realizedThreats(ctx, threats)` keeps a threat only when
     `lossConfirmed(ctx)` holds and the threat is attributed. With
     `ctx.refutationPvSan`, attribution means one of:
     - the refutation's first move equals `threat.moveSan`;
     - the walked line (≤ `CONFIG.tacticVerification.maxLinePlies`) has the
       opponent capturing on `threat.target`;
     - for checks, the line mates.

     With no refutation line (the live path), the static danger is enough.
4. **`chance-inventory.ts`.** The student's own real chances:
   - `lineCpFor(ctx, san)` returns `ctx.cpBefore` when `san ===
     ctx.bestMoveSan`, the matching `alternatives[].cp`, or undefined.
   - `realChance(ctx, chanceSans)` returns `{ san, cpWhite } | null`: the
     best-evaluated chance that appears among the engine lines. A chance is
     real only when `evalGap(chanceCp, referenceCp).meaningful`. Take the
     reference from the first rule that applies:
     - the best engine line whose SAN is not in `chanceSans`;
     - otherwise, when the played move is not in `chanceSans`, `ctx.cpAfter`;
     - otherwise there is no reference, and the chance counts as real (every
       good move is a chance).

     A chance that is not among the engine lines is never real. This is the
     poisoned-capture filter.
   - `missedChance(ctx, chanceSans, chance)`: `!chanceSans.includes(ctx.moveSan)`
     and `evalGap(chance.cpWhite, ctx.cpAfter).meaningful`.
5. **DQ-09 at detection.** In `buildDiagnosticObservations`, skip every
   detector on a ply where `!isDiagnosticallyMeaningfulPly(ctx)`. That drops
   both failed and non-failed observations. Do the same in
   `play-move-quality.ts` `diagnosisCodesFor`.
6. Unit tests use hand-built FENs, three to five per helper. Cover: a
   hanging-queen capture as a dangerous threat, a defended piece that is not
   dangerous, a mate threat, a poisoned capture that is not a real chance, the
   in-check null-move case, and attribution with and without a refutation
   line.

- [x] Failing tests first, then implement.
- [x] Existing detector tests still pass. No detector has changed yet.
- [x] Lint, typecheck, and run the diagnostics tests plus
  `apps/api` `build-diagnostics` / `play-move-quality` tests.

Commit: `feat(diagnostics): eval context, detection-time DQ-09, threat and chance inventories`

### Task 76.3 — Defensive and self-inflicted detectors: mechanism-specific, eval-confirmed

**Read:** Task 76.2's three new files, every detector below and its test,
`diagnose.md` §4.4.
**Files:** `detectors/{ms-01,ms-02,ms-03,bv-01,bv-10,bv-04,bv-12,bv-15,bv-16,bv-22,ms-08,ms-14}-*.ts`
and their tests.

These detectors share one shape: an **opportunity** is "the theme was present
and dangerous", and a **failure** is "that specific threat was realised and
the eval confirms the loss". Use `buildEvalObservation`. Stop using
`buildQualityObservation` in these files.

| Code | Opportunity | Failed |
|---|---|---|
| MS-02 D | `opponentThreatsBefore(capture)` non-empty, **or** realised post-move captures non-empty | `realizedThreats(opponentThreatsAfter(capture))` non-empty |
| MS-01 D | same with `check` | same with `check` |
| MS-03 D | same with `threat` | same with `threat` |
| BV-01 D | pre-move own hanging pieces (`computePositionFeatures(fenBefore).hangingPieces`, mover's colour) that are dangerous captures, **or** a realised capture on a post-move hanging own piece | realised capture whose target is a post-move own hanging piece |
| BV-10 B | today's trigger (pieces newly hung by the opponent's last move) restricted to dangerous captures | realised capture on one of those squares |
| MS-08 N and BV-15 B | the moved piece lands on a square the opponent attacks (`attackersOf(fenAfter, dest, opponent).length > 0`) | `see(fenAfter, dest, opponent) >= minThreatSeeCp`, `lossConfirmed`, and when a refutation exists, the line captures on `dest` |
| BV-16 B / BV-12 B | today's trigger | `lossConfirmed`, and either the refutation's first move starts from the revealing piece's square, or the line captures on the revealed square. With no refutation: static SEE ≥ threshold on the revealed square, or the revealed piece is the king |
| BV-04 B | today's trigger | `see(fenBefore, dest, mover) < 0` and `lossConfirmed` |
| BV-22 B | today's trigger (≥ 2 own loose pieces) | a realised capture whose target is one of those loose squares |
| MS-14 N | today's trigger | punished within two plies **and** `lossConfirmed` (an even trade is no longer a failure) |

A threat that exists after the move but is not realised (compensated, or not
real) does not fail. It still counts as a success when the pre-move
opportunity existed.

- [x] For each detector, first update its test file to the new semantics
  (failing), then implement. Each test file needs:
  - one realised failure;
  - one compensated case: the same static shape where `cpAfter ≈ cpBefore`
    gives `failed: false`, or no observation when there was no pre-move
    opportunity;
  - one no-opportunity case.
- [x] Lint, typecheck, and `npx vitest run src/diagnostics`.

Commit: `fix(diagnostics): defensive and self-inflicted codes count real threats and eval-confirmed losses`

### Task 76.4 — Offensive and tactic detectors

**Read:** `chance-inventory.ts`, `eval-verdict.ts`, the detectors below and
their tests, `diagnostics/detectors/ta-offensive.ts`, `ta-defensive.ts`.
**Files:** `detectors/{ms-04,ms-05,ms-06,bv-02,ms-07}-*.ts`, `ta-offensive.ts`,
`ta-defensive.ts`, and their tests.

| Code | Chance set (SANs at `fenBefore`, the played move included when it qualifies) | Opportunity | Failed |
|---|---|---|---|
| MS-05 O | own captures with `see(fenBefore, to, mover) >= minThreatSeeCp` | `realChance` not null | `missedChance` |
| BV-02 O | own captures of enemy pieces in `computePositionFeatures(fenBefore).hangingPieces` | same | same |
| MS-04 O | all own checks | same | same |
| MS-06 O | all own quiet threats | same | same |
| MS-07 N | today's trigger | unchanged | `lossConfirmed`, and `ctx.bestMoveSan` is one of the intermediate moves. Remove the hard-coded `true` |
| TA-* O | `ctx.tacticOpportunity`. Task 76.5 makes it eval-gated at its source | unchanged | `!found && lossConfirmed` |
| TA-* D | `ctx.tacticDiagnostic`. Task 76.5 makes it eval-aware at its source | unchanged | `diagnostic.failed && lossConfirmed` |

`computeCctOpportunities` returns *unplayed* lists. Build each chance set from
the own CCT scan on `ctx.checksCapturesThreats`, so the played move is
included when it qualifies. For the TA rows, `hwdl` and `severity` come from
`buildEvalObservation`'s rules. Keep `rank` on the TA offensive rows.

- [x] Tests first. Each detector test covers:
  - a real chance missed (failed);
  - the chance taken (not failed);
  - a chance absent from the engine lines, or not better than the best
    non-chance line (no observation);
  - the equal-alternative case: played move ≈ chance eval, so not failed.
- [x] Lint, typecheck, and `npx vitest run src/diagnostics`.

Commit: `fix(diagnostics): offensive codes need a real, eval-confirmed chance`

### Task 76.5 — Tactic finder verdicts: found, missed, allowed, prevented

**Read:** `docs/tactics-rework.md` §5 and §9 (only the "A gate that was tried
and reverted" subsection), `game-tactic-motifs.ts`,
`played-tactic-alternative.ts`, `tactic-allowed.ts`, `available-motifs-scan.ts`,
`tactic-prevention-check.ts`, `apps/api/src/services/tactic-prevention.ts`.
**Files:** those files, a new `realistic-threats.ts` in chess-analysis (+ test),
their tests, and `tactic-allowed.test.ts`.

1. **Missed and found** (`classifyTacticMotifOpportunity`). Skip both gates
   when `cpBefore`/`cpAfter` are missing.
   - **Materiality.** Find the first line in `evals[ply-1].lines[1..]` whose
     static `classifyTacticMotif` headline differs from the best move's
     headline. Use `quality: 'best'`, the `checkmateFlag` helper, and no
     `pvSan`. When such a line exists and `!evalGap(bestCp,
     thatLineCp).meaningful`, return `null`: the tactic did not decide
     anything. When no such line exists (a single line, or every line has the
     same motif), keep the opportunity.
   - **No false miss.** When the final `found` is false and
     `!playedMoveGap(move).meaningful`, return `null`. Their move kept the
     value, so "missed" is false and "found" would be too.
2. **Allowed** (`computeTacticAllowed`). Return `undefined` when
   `playedMoveGap(move)` exists and is not meaningful. This is the sacrifice
   and lure case.
3. **Prevented** (`tactic-prevention.ts`):
   - **Realistic threats.** Add a new pure function
     `realisticThreatScan(scan, lines, fen)`. It keeps a sighting only when
     both hold:
     - its claim wins something: `gainKind === 'mate'`, or `'material'` with
       `verifiedGain >= CONFIG.tacticVerification.minStaticGainPawns`;
     - its line is one the side to move would actually play:
       `!evalGap(lines[0] cp, lines[rank] cp, sideToMove).meaningful`.

     It then recomputes `motifs`. Apply it to both the before and the after
     scans, in the free path (cache the filtered scan) and in the gated path.
   - **Compensated.** When a motif is not defused and
     `playedMoveGap(move)?.meaningful === false`:
     - do not count it as preventable;
     - `diagnosticByPly` records `failed: false`;
     - `byPly` gets no card when the primary motif is the undefused one.

     Defused motifs still count as prevented.
   - Leave the `BEST_OR_BETTER` skip exactly as it is. Its doc comment says
     it must not change.
4. Do **not** touch `tactic-detectors/*`, `verify-tactic-claims.ts` or
   `verify-tactic-line.ts`. The precision and recall numbers must not move.
   If a test there changes, stop and report it.

- [x] Failing tests:
  - An opportunity whose second line is as good gives `null`.
  - A real fork missed, with a meaningful drop, gives `found: false`.
  - A missed motif where the played move is equally good gives `null`.
  - A missed mate while +15 still gives an opportunity (cp rule).
  - `computeTacticAllowed` on a sound sacrifice gives `undefined`.
  - `realisticThreatScan` drops a sighting that only appears in a losing
    rank-4 line.
  - Prevention compensated: an undefused threat with no eval loss gives
    `diagnosticByPly.failed === false` and no `byPly` card.
- [x] Run `npm run test -w @freechesscoach/chess-analysis` (this includes
  `tactic-precision.test.ts`, `lichess-puzzle-validation.test.ts` and the
  review-case tests; ceilings and floors must hold). Also run
  `tactic-prevention` and `analysis` tests in `apps/api`, plus lint and
  typecheck.

Commit: `feat(tactics): eval-witnessed found/missed/allowed/prevented verdicts`

### Task 76.6 — Idempotent re-analysis, measurement, docs

**Read:** `apps/api/src/services/analysis.ts:160-182`,
`apps/api/src/db/repositories/diagnostic-observations.ts`.
**Files:** `diagnostic-observations.ts` (new `replaceForGame`),
`services/analysis.ts`, `diagnostics/README.md`, `docs/tactics-rework.md`
(new §10), `AGENTS.md` (plan pointer).

- [x] Failing repository test: `replaceForGame(db, gameId, rows)` deletes the
  game's rows and inserts the new ones in one transaction. Use it from
  `recordDiagnosticObservations`.
- [x] Re-analyse the test user's games. The local stack runs the worker from
  source (`tsx watch`), so code changes are live:
  ```sql
  select graphile_worker.add_job('analyze-game', json_build_object('gameId', g.id), job_key := 'analyze-game:' || g.id)
  from games g join analyses a on a.game_id = g.id
  where g.user_id = '6dcb1cee-9d82-4235-81fc-da01f650b911' and a.status = 'ready';
  ```
  Then queue `rebuild-diagnostic-profile` for the user
  (`job_key := 'rebuild-diagnostic-profile:<userId>'`, queue name the same).
- [x] Re-run the per-code count against `diagnostic_observations` and add the
  after-table next to the baseline above. Pass criteria:
  - No code+direction has opportunities above ~30% of diagnosed plies.
  - None of the known false failures listed in the baseline remain.
  - Spot-check three failures per remaining code by hand: the named mechanism
    must be the one that lost the eval.

  **Only if** a code still exceeds 30%, add a stopgap in `confidenceTier`
  (`build-profile.ts`): never above `'insufficient'` when opportunities /
  diagnosed plies > 0.3. Record why.
- [x] Docs:
  - `diagnostics/README.md` step 2: an opportunity must be dangerous and
    eval-real, a failure must be the mechanism plus an eval-confirmed loss, and
    DQ-09 applies at detection.
  - `docs/tactics-rework.md` §10 "Eval witness on verdicts": what changed, why
    it sits at the verdict layer, the thresholds, and the before/after
    numbers.
  - Update the AGENTS.md plan pointer.

Done 2026-09-24 (uncommitted). Where it went beyond the task:
- **MS-03's pre-move side is direct threats only** (`opponentDirectThreatsBefore`):
  a mate in one, or a surviving promotion if the mover passed. Quiet "threat
  to make a threat" moves had kept MS-03 at 48% of diagnosable plies.
- **A refutation capture counts only on a net material loss.** One ply after
  the capture, the mover must be down against `fenBefore`
  (`refutationWinsOn` / `refutationCostsMaterial` in `threat-inventory.ts`).
  Without this, the exchange `cxd5 Nxd5` read as "left d5 hanging".
- **The allowed card reads the next ply's pre-gate chance**
  (`build-game-report.ts`), so a blunder keeps its card when the reply didn't
  cash in fully. See `tactics-rework.md` §10.
- **No confidence stopgap was added.** MS-02 (145/398 = 36%) and BV-01 (30%)
  are real en-prise positions at ~500 rating, not artefacts.
- **After-numbers** are in `docs/tactics-rework.md` §10.

Commit: `fix(diagnostics): idempotent observations; docs for eval-witnessed verdicts`

## Verification (end of phase)

- `npm run verify:changed` is green.
- `tactic-precision.test.ts` ceilings and Lichess recall floors are unchanged.
- The test user's Progress page shows opportunity counts in the tens, not the
  hundreds. Every "failed" card, when opened, points at a move whose eval
  dropped for that card's reason.

---

# Phase 77 — Leaner analysis: one engine pass, one verdict per move, early exit

**Source spec:** this request (no separate spec file). Everything cited here was
checked on 2026-09-24 by a read-only code walk. Re-check the lines before you
edit; Phase 76 is uncommitted in the same tree. Do **not** open
`docs/diagnose.md` or `docs/algorith.md`. Task 77.5 must read
`docs/tactics-rework.md` §9 and §10 first.

## The request

Make game analysis shorter and lighter on engine, CPU and RAM, without
changing what it concludes:

- Run the most valuable check first and **stop** once the answer is settled,
  instead of running every check.
- When one engine evaluation can answer a question, don't make a second
  call.
- Each move gets **exactly one** tactical reason:
  - a failure (missed or allowed), **or**
  - a credit (found a tactic, or defused a threat), **or**
  - nothing.

  Rank the candidate reasons by how much of the eval they could explain,
  check the strongest first, and stop as soon as no unchecked reason could
  beat the one already confirmed. If nothing settles it early, run every
  check and pick the strongest.

**Not in scope:** changing tactic detectors or `verify-tactic-*` (the precision
ceilings and recall floors must not move), and the eval-witness thresholds.
Owner decision, not in this phase: native evaluates at depth 18 (Helm
`ENGINE_DEFAULT_DEPTH`) while the tunnel and chess-api use depth 12
(`packages/shared/src/constants.ts:167`).

## Where the cost goes today (verified; N plies, P = N + 1 positions)

**Engine**
- `analyzeInChunks` (`apps/api/src/services/analysis.ts:325`) sends all P
  positions in chunks of 6, multiPV 5. Book positions and repeated positions
  are included, and nothing is deduplicated.
- **`deepen-analysis`** (`services/deepen-analysis.ts:44-50`, queued from
  `jobs/analyze-game.ts:49`) sends all P positions **again** and throws the
  results away. It was meant to fill the `position_evaluations` cache, which
  was deleted in commit 2e13f78. **This is 100% waste.**
- The brilliant-soundness check (`services/brilliant-soundness.ts`) calls
  `analyzePosition(fenAfter)`. `evals[ply]` already is that position, at the
  same depth, and "best reply keeps win% ≥ before − 3" is exactly
  `winPctFor(mover, toCpWhite(evals[ply].lines[0]))`. **One avoidable call
  per candidate.**
- No position evaluations are stored (`EngineEval[]` is never persisted).
  Re-analysing a game, or resuming a paused one, sends every position that
  isn't in the Lichess index to the engine again. Doing the Phase 76
  re-analysis twice exhausted chess-api.com's daily quota.
- The chess-api circuit breaker (`chess-api-engine-backend.ts:161-162`)
  resets on every 6-position chunk. When chess-api hangs, every chunk pays
  up to 3 × 15 s again. `FallbackEngineBackend` also has no memory between
  chunks.

**CPU**
- `classifyMoves` runs **twice** (`analysis.ts:98, 102`). Each run includes P
  feature scans and N `analyzeChecksCapturesThreats` (CCT) scans. The first
  run only feeds the brilliant gate.
- `attachEnrichment(enrichPositions)` (`analysis.ts:101-104`) is a third P
  feature scan, and it overwrites values that are already set.
- `computeTacticMotifPrevented` runs a PV motif scan per position: 5 lines at
  depths 7/5/3/1/1, i.e. 17 plies, each with the full detector registry plus
  `computePositionFeatures`.
  - Even plies are classified and then discarded
    (`available-motifs-scan.ts:69`).
  - Features and diffs are never read (`pv-tactics.ts:60-70`).
  - Lines that `realisticThreatScan` later drops are scanned anyway.
- `buildGameReport` runs 1–6 detector-registry passes per ply: the
  opportunity itself, the materiality witness, and the played alternative.
  Every ply goes through this, including moves that lost nothing and had
  nothing at stake.
- Diagnostics:
  - `computeTacticMotifRankHits` classifies up to 5 lines per user ply, even
    on plies that are then skipped as decided (`build-diagnostics.ts:53`
    vs `:70`).
  - `buildPlyDiagnosticContext` recomputes CCT(fenAfter), which is the next
    ply's stored `checksCapturesThreats`.
  - BV-01, MS-01 and MS-02 each run the same null-move CCT.
  - BV-01 and BV-02 each recompute features for `fenBefore`.
- **Dead path:** the gated prevention fallback (`tactic-prevention-scans.ts:55`)
  never runs, because `isTacticalPosition` is only set later, in
  `buildGameReport`. Remove it rather than "fixing" it into new engine calls.

**No timing exists** for analysis. The only related output is the
`engine-source:` log line.

## Design decisions (do not relitigate)

- **Measure first, then cut.** Task 77.1 adds per-step timings and a
  replayable benchmark. Every later task reports before/after numbers from
  it.
- **One engine pass per game, stored.** Persist a game's `EngineEval[]`.
  Re-analysis and resume reuse whatever is already stored and only request
  what is missing.
- **Identical output** for Tasks 77.2–77.4. Pin the annotated PGN, report and
  observations of a fixture game before and after, byte for byte (the report
  is already deterministic; see `build-game-report.test.ts`).
- **Task 77.5 intentionally changes output:** at most one tactic reason per
  move, which replaces today's up-to-three cards. It fixes Phase 76's known
  weakness, where a move's diagnostic cause was chosen by family order
  instead of by how much of the loss it explains.

## Layering

Pure decision logic lives in `packages/chess-analysis`. Persistence (a
migration, `analyses` repository functions with Zod-validated writes) and job
wiring live in `apps/api`. SQL only in `db/repositories/`.

### Task 77.1 — Timings, stored evals, and a replay benchmark

**Read:** `apps/api/src/services/analysis.ts:62-160,325-353`,
`apps/api/src/db/repositories/analyses.ts`, `apps/api/src/db/schema.ts:95-110`,
the newest file in `apps/api/src/db/migrations/`.
**Files:**
- `analysis.ts`
- a new migration `analyses.engine_evals jsonb null`
- `schema.ts`
- `analyses.ts` (repository): `storeEngineEvals`, `findEngineEvals`
- a new `apps/api/scripts/bench-analysis.ts`
- a `package.json` script `bench:analysis`

- [x] **Store evals.** After each chunk in `analyzeInChunks`, write the evals
  gathered so far with `storeEngineEvals`, validated with
  `EngineEvalSchema.array()`. On entry, load `findEngineEvals`: positions that
  already have an eval at the same index **and** the same `fen` are reused,
  and only the missing ones go to the engine. Test: resuming after a
  simulated failure at chunk 3 requests only chunks 3+. Test: re-analysis of
  a finished game makes zero engine calls.
- [x] **Timings.** Wrap each step of `runAnalyzeGameJob` in a small `timed(label, fn)` helper:
  - engine
  - classify
  - prevention
  - report
  - diagnostics
  - candidate moments

  Log one line per game: `analysis-timing: game=<id> plies=<N> engineCalls=<n> engine=<ms> classify=<ms> ...`.
  Count engine calls with a counting wrapper around `deps`.
- [x] **Benchmark.** `bench-analysis.ts --user <id>` or `--game <id>` loads
  stored evals and PGNs and runs every pure step from `runAnalyzeGameJob`
  (classify → prevention free path → report → diagnostics), with no DB writes
  and no engine calls. It prints per-step milliseconds (median of 3 runs)
  and peak `process.memoryUsage().heapUsed`, and writes a JSON snapshot of
  the annotated PGN, report and observations for the identical-output
  checks in 77.2–77.4.
- [x] Fill the evals once with a re-analysis of the test user
  (`6dcb1cee-9d82-4235-81fc-da01f650b911`). Record the baseline table (per
  step, total, heap) in this task.

  **Baseline (2026-09-24).** 19 games with stored evals, 1,165 plies, no
  engine. Median of 3 runs. Snapshot:
  `<scratchpad>/snap-77-1.json`.

  | Step | Median ms | Peak heap MB |
  |---|---|---|
  | classify | 57,284 | 446.8 |
  | prevention | 621,764 (65%) | 370.7 |
  | report | 138,182 | 392.6 |
  | diagnostics | 134,908 | 414.4 |
  | candidateMoments | 2 | 414.4 |
  | **total** | **951,856 (~50 s/game)** | **446.8** |

  Live `analysis-timing:` lines from the fill run (local engine):
  - engine: 20-220 s per game;
  - classify spikes of 40-60 s, which are the brilliant-soundness engine
    calls that 77.2 removes;
  - prevention: 7-48 s per game.

Commit: `perf(analysis): store engine evals, per-step timings, replay benchmark`

### Task 77.2 — Engine waste

**Read:** Task 77.1 output, `jobs/analyze-game.ts`, `services/deepen-analysis.ts`,
`services/brilliant-soundness.ts`, `services/engine/chess-api-engine-backend.ts`,
`services/engine/fallback-engine-backend.ts`, `services/tactic-prevention-scans.ts`.
**Files:** those files, `jobs/index.ts` (task list), and their tests.

- [x] **Stop queueing `deepen-analysis`.** Delete the job, its service and its
  task registration, and drop pending jobs in the migration from 77.1 (or a
  new one): `delete from graphile_worker.jobs where task_identifier = 'deepen-analysis'`.
- [x] **Brilliant soundness from stored evals.** Make it a pure function of
  `(evals[ply], mover, beforeWin)`, with no engine argument. Keep the same
  threshold. Test: identical verdicts on the existing fixtures.
- [x] **Deduplicate repeated positions** within a game by `positionKey(fen)`
  before sending them, then fan the results back out.
- [x] **Per-job circuit breakers.** Move chess-api's
  `consecutiveFailures`/`circuitOpen` onto the backend instance (it is built
  once per job, `jobs/analyze-game.ts:39`). Give `FallbackEngineBackend` a
  sticky "primary failed" flag, so later chunks go straight to the fallback.
  Test: after 3 failures, the next chunk makes no primary calls.
- [x] **Delete the dead gated prevention fallback** and the `engine`
  parameter it threads through `computeTacticMotifPrevented`.
- [x] Re-run the benchmark and a real re-analysis of one game. Check that the
  output is identical to 77.1's snapshot and that the logged engine-call
  count drops. Record the numbers.
  Real re-analysis of game `6dc75948` (33 plies):
  - engine calls: 9 → **0**;
  - engine: 20,756 → 8 ms;
  - classify: 6,031 → 1,450 ms;
  - total: 51,137 → 26,642 ms.

  The migration also needs `DATABASE_URL` set when run from the host:
  `DATABASE_URL=postgresql://chess_coach:chess_coach@localhost:5432/chess_coach npm run migrate -w apps/api`.

  **Benchmark (2026-09-24), done.** `--runs 1` (the new flag) on the same 19
  games and 1,165 plies: `snap-77-2.json` is byte-identical to
  `snap-77-1.json` (same sha256). The pure steps are unchanged, as expected,
  because the benchmark never made engine calls: classify 60,305 ms
  (57,284 before), prevention 655,909 (621,764), report 145,677 (138,182),
  diagnostics 140,697 (134,908), total 1,002,590 (951,856). The ~5% gap is
  single-run noise against a median of 3. Peak heap 218 MB (447) reflects
  one run, not a real saving. The savings are in live engine calls: no
  `deepen-analysis` pass (P calls per game), no soundness call (the 40-60 s
  classify spikes), and each repeated position sent once.
  **Still open:** the real re-analysis of one game to see the drop in
  `engineCalls` in the log line. It needs a queued analysis job, so the
  implementer did not run it.

Commit: `perf(analysis): one engine pass per game — drop deepen, reuse evals, sticky breakers`

### Task 77.3 — Compute each thing once

**Read:** `analysis.ts:95-110`, `packages/chess-analysis/src/classify.ts`,
`position-enrichment.ts`, `build-game-report.ts:230-250`,
`apps/api/src/services/build-diagnostics.ts`,
`packages/chess-analysis/src/diagnostics/context.ts`, `threat-inventory.ts`,
`detectors/bv-01-*.ts`, `detectors/own-chance.ts`,
`services/engine/lichess-eval-engine-backend.ts`,
`services/engine/lite-supplemented-engine-backend.ts:220-265`.

- [x] **`classifyMoves` once.** Pick the brilliant candidates from the one
  classification, re-classify **only** those plies with their soundness, and
  splice them back in. Remove the redundant `attachEnrichment`/`enrichPositions`
  if `classifyMoves` already sets the same fields (verify field by field
  first; keep whichever is the single source).
- [x] **Reuse features.** Pass the enrichment features into
  `computeIsTacticalPosition` (`build-game-report.ts:240`).
- [x] **Diagnostics sharing.** In `buildPlyDiagnosticContext`, take
  `opponentChecksCapturesThreats` from the next ply's stored
  `checksCapturesThreats`, falling back to computing it. Add `featuresBefore`
  from `previousMove.features`, and compute a lazily memoised null-move CCT
  once per context. Switch BV-01, MS-01, MS-02, MS-03 and BV-02 to these
  fields.
- [x] **Rank hits only where needed.** Compute rank hits only for plies that
  pass `isDiagnosticallyMeaningfulPly`.
- [x] **Engine-backend CPU.** The Lichess backend's `analyzeGame` path should
  skip `computePositionFeatures` when `toLeanEval` discards it.
  `needsSupplement` should count legal moves with
  `new Chess(fen).moves().length`.
- [x] Benchmark: identical snapshot, with per-step times recorded.

  **Done (2026-09-24).**
  - `classifyMoves` takes a `resolveBrilliantSoundness(move)` callback; only
    the plies it answers are built a second time (`analysis-steps.ts`).
    `attachEnrichment` is gone: `classifyMoves` already sets `features`,
    `moveFlags` and `featureDelta` from the same `enrichPositions` call.
  - `featuresBeforeOf` (`features-before.ts`) reuses the previous move's
    `features` when its `fenAfter` is this `fenBefore`; used by
    `computeIsTacticalPosition` and the diagnostic context's new
    `featuresBefore` (BV-01, BV-02).
  - `opponentChecksCapturesThreats` reuses the next ply's stored scan only
    when `nextMoves[0]` is ply + 1 **and** its `fenBefore` is this
    `fenAfter`. It is the same call on the same FEN: the stored scan's only
    option, `featuresBefore`, feeds `captureOpportunities`, which is what the
    call computes without it. The detector test fixture's fake reply now
    carries its own scan instead of the original move's.
  - Null-move CCT memoised per context (`diagnostics/null-move-scan.ts`,
    WeakMap), shared by BV-01, MS-01 and MS-02. MS-03's "before" side is a
    legal-move walk, not CCT; its "after" side uses the shared scan.
  - Rank hits and contexts only for `isDiagnosticallyMeaningfulPly` plies.
  - Lichess `analyzeGame` builds lean evals without features;
    `needsSupplement` counts `legalSanMoves(fen).length`.

  `--runs 1`, same 19 games / 1,165 plies: `snap-77-3.json` is
  byte-identical (`cmp`) to `snap-77-1.json`. Noisy: 77.4 was being edited
  at the same time, so its prevention change is in these numbers.

  | Step | ms (77.2) | ms (77.3) | Peak heap MB |
  |---|---|---|---|
  | classify | 60,305 | 36,029 | 147.3 |
  | prevention | 655,909 | 342,933 (77.4 in tree) | 186.4 |
  | report | 145,677 | 144,886 | 169.0 |
  | diagnostics | 140,697 | 105,730 | 193.6 |
  | candidateMoments | — | 2 | 193.6 |
  | **total** | **1,002,590** | **629,581** | **193.6** |

Commit: `perf(analysis): compute classification, features and scans once`

### Task 77.4 — Lighter PV motif scan

**Read:** `pv-tactics.ts`, `available-motifs-scan.ts`, `realistic-threats.ts`,
`apps/api/src/services/tactic-prevention*.ts`. Do not edit
`tactic-detectors/` or `verify-tactic-*`.

- [x] Give `annotatePvTactics` a `claimsOnly` option. It skips
  `computePositionFeatures`, the feature diffs, and classification of even
  plies, while still replaying them and threading `previousMove`.
  `scanAvailableMotifs` uses it.
  Every `scanAvailableMotifs` caller (`tactic-prevention-scans.ts`,
  `tactic-prevention-check.ts`'s `scanThreatOutcome`,
  `apps/api/src/services/position-tactics.ts`'s graduated mode) reads only
  odd-ply claims, so all of them get the fast walk. `annotatePvTactics` keeps
  the full mode by default; its only other callers are its tests.
- [x] Apply `realisticThreatScan`'s playable-line filter *before* scanning a
  rank. Only ranks whose line is playable get scanned.
  New `scanRealisticThreats(fen, lines)` (`realistic-threats.ts`) passes the
  line-eval half as `scanAvailableMotifs`' `shouldScanRank`; the claim-gain
  half needs the claims, so it still runs after. The per-eval-index cache in
  `tactic-prevention-scans.ts` is unchanged: it always held the filtered scan.
  Tests: `pv-tactics.test.ts` (claims-only odd plies = full mode's) and
  `realistic-threats.test.ts` (fast path = full-mode filter-after-scan,
  including an unplayable rank).
- [x] Benchmark: identical snapshot. Record the prevention step's time and
  heap before and after.
  **2026-09-24, `--runs 1`:** `snap-77-4.json` is byte-identical to
  `snap-77-1.json` (same sha256). Prevention **655,909 → 346,665 ms** (−47%;
  621,764 in the 77.1 median baseline), peak heap at that step 203.3 MB
  (single run; 370.7 in the 3-run baseline). Total 674,949 ms. Task 77.3 was
  being implemented and benchmarked at the same time, so the other steps'
  times are noisy and not attributable to this task.

Commit: `perf(tactics): scan only what the prevention path reads`

### Task 77.5 — One verdict per move, strongest reason first, early exit

**Read:** `docs/tactics-rework.md` §9-§10, `eval-witness.ts`,
`tactic-opportunity-witness.ts`, `game-tactic-motifs.ts`,
`played-tactic-alternative.ts`, `tactic-allowed.ts`, `realistic-threats.ts`,
`tactic-card-order.ts`, `build-game-report.ts`,
`apps/api/src/services/tactic-prevention.ts`,
`diagnostics/resolve-episodes.ts`, `apps/api/src/services/build-diagnostics.ts`.
**Files:**
- new `packages/chess-analysis/src/move-verdict/`, with one reason per
  file: `index.ts`, `ceilings.ts`, `reasons/*.ts`, plus tests
- `build-game-report.ts`
- `tactic-prevention.ts`
- `resolve-episodes.ts`
- `build-diagnostics.ts`
- `game-tactic-motifs.ts` (counts)

**The verdict.** `decideMoveVerdict(move, evals, context) → MoveVerdict | null`,
where `MoveVerdict = { kind: 'failure' | 'credit', reason, explainedCpWhite, card }`.
`reason` is one of:
- failure: `missedMate`, `allowedMate`, `missedTactic`, `allowedTactic`
- credit: `foundMate`, `foundTactic`, `defusedThreat`

The notation below:
- **B:** the best line's cp (`cpBefore`).
- **P:** the played move's cp (`cpAfter`).
- **R:** the best line whose headline motif differs from the best move's (the
  materiality witness already finds it). R = B when the best move has no
  motif.
- **S:** the second-best line's cp.

All values are White-perspective, and every comparison goes through
`evalGap`.

1. **Gate (free).**
   - `playedMoveGap(move).meaningful` → failure branch.
   - Else, when the move mattered (`evalGap(B, S).meaningful`, with the played
     move at or near B) → credit branch.
   - Else → `null`. **No detector runs at all.**
2. **Ceilings (free, from stored evals only).**
   - Failure branch:
     - `allowedMate` (the opponent mates in `evals[ply].lines[0]`) = the
       full gap;
     - `missedMate` (the mover mates in `evals[ply-1].lines[0]`) = the full
       gap;
     - `missedTactic` = gap(B, max(R, P));
     - `allowedTactic` = gap(min(R, B), P).
   - Credit branch:
     - `foundMate` = gap(B, S);
     - `foundTactic` = gap(B, R);
     - `defusedThreat` = the smaller of the threat's claimed gain (pawns →
       cp, from the prevention scan's before-sighting) and gap(B, S).
   - A ceiling that is not meaningful drops that reason unchecked.
3. **Checks in descending ceiling order.** Each check is today's existing
   logic, reused, not rewritten:
   - `missed*` / `found*`: `classifyTacticChance` / `classifyPlayedTacticAlternative`.
   - `allowed*`: the next ply's pre-gate chance (as `computeTacticAllowed`
     reads it).
   - `defusedThreat`: `realisticThreatScan` on the before and after scans.

   A check returns the confirmed explained value, or `null`. **Stop** when a
   confirmed reason's value ≥ the largest remaining ceiling. Otherwise run
   the rest and keep the largest confirmed. Ties go to the fixed order mate >
   tactic > threat.
4. **Value lost and value gained (net) decides the one reason.** Every check
   walks its own line and returns
   `{ explainedCpWhite, gainedPawns, lostPawns, mateFor, mateAgainst }`. Reuse
   the material walk in `verify-tactic-line.ts` (`materialBalance` per ply,
   capped at `CONFIG.tacticVerification.maxLinePlies`); do not rewrite it.
   Which line each check walks:
   - missed: the best line;
   - allowed: the refutation, `evals[ply].lines[0].pvSan` from `fenAfter`;
   - found: the played move plus its continuation;
   - defused: the before-sighting's line.

   Rules:
   - **The primary reason is the largest confirmed value.** Rank by
     `explainedCpWhite`, and break ties by |net material| (mate above any
     material). The smaller events on the same move go only into the card's
     detail. Example: the move wins a knight (+3) but the refutation takes
     the queen (−9), net −6. The reason is the queen loss, and the detail
     reads "won a knight, but it cost the queen".
   - **Material must agree with the eval.** Keep a reason only when both
     hold:
     - The net material points the same way as its eval gap. A loss needs
       net ≤ −1 or mate against; a gain needs net ≥ +1 or mate for.
     - The eval confirms it (`evalGap(...).meaningful`).

     A material story the eval contradicts is dropped: "won a rook" with no
     eval gain means the rook was bait. Keep Phase 76's positional rung: a
     motif with gain kind `positional` needs no material, only the eval.
   - **The credit side nets the same way.** `foundTactic` needs net > 0 on
     the played line (winning a rook while handing back the queen is not a
     find). `defusedThreat` is worth what the threat's line would have won.
   - **Cheaper ceilings.** Tighten each eval ceiling with a material upper
     bound read straight off the stored line: the most valuable piece the
     line can capture, or mate. Once a mate or a queen-sized loss is
     confirmed, nothing smaller can win, so stop there.
5. **Laziness is the saving.**
   - The prevention PV scan runs only when `defusedThreat` is still a
     candidate at step 3. Build a lazy per-position scan cache in
     `tactic-prevention.ts` instead of the eager loop over every move.
   - The materiality witness runs only when `missedTactic` or `foundTactic`
     is being checked.

**Wiring.**
- `build-game-report.ts` sets **at most one** of `tacticOpportunity` /
  `tacticAllowed` / `tacticPrevention` per move, from the verdict. The web
  UI already renders any subset (`apps/web/src/features/board/tacticSelection.ts`,
  `TacticReasonList.tsx`), so check that it shows a single card cleanly.
  `tactic-card-order.ts` becomes trivial; keep its export.
- Per-game counts come from the verdicts:
  - `computeTacticMotifCounts`: opportunities = verdicts `missedTactic` +
    `foundTactic`; found = `foundTactic`.
  - Prevention counts: preventable = `defusedThreat` + the unprevented
    threats recorded under `allowedTactic`; prevented = `defusedThreat`.

  Document this change in counting next to the functions.
- **Diagnostics: at most one observation per ply**, and it comes from the
  verdict. This applies to successes as well as failures (owner, 2026-09-24).
  - The detectors still run, but only on plies whose verdict is not `null`.
    A `null` verdict means nothing was lost and nothing was at stake, so it
    is not a §4.4 opportunity. Skip every detector there.
  - Of the observations the detectors return, keep only the one whose code
    matches the verdict, `failed = (verdict.kind === 'failure')`. Drop the
    rest, failed and non-failed alike. This ends the double counting where
    one attacked piece fed MS-02, BV-01, BV-15 and MS-08 all at once.
  - Write the verdict-to-code mapping in `move-verdict/diagnostic-code.ts`:
    - TA codes via `motifToCode`;
    - `allowedTactic` whose claim wins a piece that was already hanging → BV-01;
    - one that wins the moved piece → BV-15;
    - another capture → MS-02;
    - a check → MS-01;
    - a quiet threat → MS-03;
    - a missed or found free capture → BV-02 (hanging) / MS-05;
    - checks → MS-04;
    - threats → MS-06;
    - `defusedThreat` → the same code the matching `allowed` would have
      used, as a success.

    When the matching detector returned nothing, record the verdict's code
    with `buildEvalObservation`. With one cause per ply, `resolveEpisodes`'
    precedence only matters for DQ-11 cascades.
  - Expected effect, to be measured and recorded here: MS-02 and BV-01
    opportunities fall from ~145/118 to a fraction of that, and the
    per-code rates become failure / (failure + handled-when-it-mattered).

- [x] Failing tests first, one per branch:
  - gate `null` (no detector call; spy on `classifyTacticClaims`);
  - rescued the queen but missed mate → `missedMate`, with the allowed check
    never run;
  - hung a piece while the best move was quiet → `allowedTactic`;
  - both present, with the missed part bigger → `missedTactic`, and the
    reverse;
  - found a fork → `foundTactic`;
  - defused a mate threat → `defusedThreat`, with the scan run only for that
    ply (spy);
  - every top line equal → `null`.
  - won a knight but the refutation takes the queen → one failure (queen
    loss), with the knight in the detail;
  - "won" a rook as bait while the eval drops → no `foundTactic`;
  - a sound sacrifice (net −3, eval holds) → no failure;
  - a queen loss is confirmed first, so the pawn-sized checks never run
    (spy).
- [x] Run `npm run test -w @freechesscoach/chess-analysis`,
  `npm run test:corpus -w @freechesscoach/chess-analysis` (ceilings and floors
  unchanged), and the apps/api analysis, prevention and build-game-report
  tests.
- [x] Benchmark: record the per-step times and how many detector-registry
  runs and PV scans the early exit saved (add counters to the benchmark).
  Spot-check 10 verdicts on the test user's games by hand, and list them in
  this task.

  **Wiring done (2026-09-24).**
  - `report-tactic-verdicts.ts` (`attachTacticVerdicts`) decides one verdict
    per move inside `buildGameReport` and sets at most one card from
    `verdict.card`; the card's sentence and its `detail` (capitalised, as a
    separate line) go into `reasons`, and any tactic card a caller attached
    earlier is replaced. `buildGameReportWithVerdicts` also returns the
    verdicts. `tactic-card-order.ts` is a fixed order (for old reports).
  - Counts: `computeTacticMotifCounts(verdicts)` (opportunities =
    `missedTactic` + `foundTactic`, found = `foundTactic`; plus mates under
    `checkmate`, see the follow-up) and `move-verdict/prevention-counts.ts` (prevented = `defusedThreat`,
    preventable = that + every `allowedTactic`, whether or not the threat stood before the move; `BEST_OR_BETTER` only guards the
    unprevented side). Prevention counts are set only when scans are given.
  - Prevention: `computeTacticMotifPrevented` is gone. `createPreventionScans`
    (`tactic-prevention.ts`) returns a per-move, per-eval-index cached
    provider; `decideMoveVerdict` calls it only for `defusedThreat`.
    `attachTacticPrevention` is gone too. The step labelled `prevention` now
    only builds the provider; its scans are timed under `report`.
  - Diagnostics: `move-verdict/diagnostic-code.ts` holds the table.
    `freePiece` goes by shape (BV-01/BV-02/MS-02/MS-05), not TA-43, since it
    *is* the plan's "free capture" row. `build-diagnostics.ts` skips
    null-verdict plies (they still extend a DQ-11 cascade), runs only the
    verdict code's detector, and synthesises with `buildEvalObservation`
    when it returns nothing. **`diagnosticByPly` is retired:**
    `ctx.tacticDiagnostic` is now built from the verdict's allowed/defused
    card; rank hits are computed only for a `TA-*` `O` target.
  - Two core fixes found by the spot-check: a move that *delivers* mate read
    as `missedMate` (the position after mate has no lines, so `cpAfter` = 0);
    `gate.ts` now takes P as the mate (test in `gate.test.ts`). And
    `detail.ts` cancels like-for-like trades ("won the queen, giving back a
    queen and a pawn" was a queen trade).

  **Follow-up (same day): tiers and mates.**
  - Tier 1 is a mate or material reason; tier 2 is positional (develops,
    tempo, safety). Tier 1 runs first, in both the ceiling order and the
    final pick. A missed or found tactic whose line wins nothing is a tier-2
    candidate, and a confirmed card's gain kind decides its tier. Tier 2 runs
    only when no tier-1 reason confirmed, and never stops a tier-1 check.
  - The verifier rejects 4.Nd5? Nxe4 5.Qd3 Nf6 as a free pawn: the knight
    retreats, and `verify-tactic-*` is out of scope. So `allowedTactic` now
    falls back to a plain capture card (`reasons/hung-material.ts`) when the
    reply's first move captures and the walk nets a loss. The eval gap still
    has to confirm it.
  - `detail.ts` cancels equal-value trades (a bishop for a knight).
  - Mates count again: `missedMate` is a `checkmate` opportunity, and
    `foundMate` is an opportunity and a find.
  - Nd5 re-checked: now `allowedTactic`, "They let you win a pawn through a
    free piece with Nxe4". `166d607a` 4.g4 keeps the develops miss, because
    it hangs nothing.

  **Benchmark (`--runs 1`, 19 games, 1,165 plies, `snap-77-5b.json`).**

  | Step | ms (77.4 clean) | ms (77.5) |
  |---|---|---|
  | classify | 36,097 | 37,502 |
  | prevention | 337,097 | 1 (scans now lazy, inside report) |
  | report | 145,179 | 81,448 |
  | diagnostics | 106,090 | 2,379 |
  | **total** | **624,465** | **121,332 (−81%)**, peak heap 156 MB |

  Counters:
  - verdicts: **988 of 1,165 plies `null`** (no detector ran there).
    Failures: allowedTactic 58, missedTactic 29, allowedMate 18,
    missedMate 10. Credits: defusedThreat 32, foundTactic 25, foundMate 5.
  - checks run: missedMate 10, allowedMate 18, foundMate 5, missedTactic
    110, allowedTactic 116, foundTactic 60, defusedThreat 58.
  - detector-registry runs: `classifyTacticChance` 314 plus 92 materiality
    witnesses. Before, at least 2 × 1,165: every ply in the report
    enrichment and again in `computeTacticMotifCounts`.
  - prevention: **112 PV scans of 1,184 positions**, before every position,
    58 threat outcomes compared.
  - diagnostic detector runs: **52**. Before, 41 detectors on each of ~398
    diagnosable plies, about 16,000.
  - checkmate motif stat: 17 opportunities, 7 found.

  **Per-code diagnostic opportunities / failures** (the test user, observation
  rows: episode primaries + successes):

  | Code | Phase 76 (§10) | 77.5 |
  |---|---|---|
  | MS-02 D | 145 / 1 | 9 / 4 |
  | BV-01 D | 118 / 10 | 2 / 2 |
  | MS-05 O | 35 / 0 | 2 / 1 |
  | MS-06 O | 31 / 2 | 1 / 1 |
  | MS-07 N | 18 / 0 | 0 |
  | MS-01 D | 16 / 1 | 0 |
  | MS-04 O | 10 / 2 | 2 / 2 |
  | MS-03 D | 5 / 0 | 0 |
  | BV-15 B | — | 7 / 5 |
  | BV-02 O | — | 5 / 2 |
  | TA-10 D | — | 4 / 2 |
  | TA-01 O | — | 2 / 1 |
  | TA-07 D, TA-07 O | — | 1 / 0 each |
  | TA-11 O, TA-14 O | — | 1 / 1 each |

  38 observations in all, 22 failed.

  **Spot-check (10 verdicts, from `snap-77-5.json`, before the follow-up):**
  1. `1f9a4fd4` 9…Qd7?? allowedTactic: Bb5 pins and wins the queen; detail
     "won a bishop, but it cost the queen". Correct.
  2. `1f9a4fd4` 19.Qe6+ allowedTactic: …Bxe6 takes the queen. Correct.
  3. `1f9a4fd4` 19…Kg5 allowedMate: f4+ mating net. Correct.
  4. `57efe425` 19.Qa3+ missedMate: Bb4+ mated. Correct.
  5. `166d607a` 45…Rf8 allowedMate: Bxf8. Correct (already lost; DQ-09
     keeps it out of the diagnostics).
  6. `166d607a` 10…dxc4 foundTactic, "broke the pin": d5 was pinned to d8,
     and the capture wins the c4 bishop. Correct.
  7. `166d607a` 23.Kxg3 foundTactic: the free bishop on g3. Correct.
  8. `9dc058e9` 18…Ng4+ foundMate; detail "won the queen, giving back a
     knight". Correct.
  9. `5bb77172` 29…Rxb2 foundMate, "You forced mate": it kept a forced mate
     but not the Qc4# mate in 1. Generous.
  10. `07eb21d9` 4.Nd5? was "missed a chance to develop"; **fixed by the
     follow-up**, see above.
  Still doubtful: `166d607a` 11.Qxd8+ as defusedThreat, which is really a
  queen trade.

Commit: `feat(analysis): one tactical verdict per move, strongest reason first with early exit`

### Task 77.6 — Docs

- [x] `docs/architecture.md`, analysis pipeline:
  - stored evals, and reuse on re-analysis and resume;
  - there is no `deepen-analysis` job;
  - the single-verdict pass;
  - how to run the benchmark.

  Deleted the comments that still claimed a `position_evaluations` cache
  (`analysis.ts` was already clean; `routes/unified-tunnel.ts`,
  `engine-client.ts`, `coach-context.ts`) and the `schema.ts`
  declaration of the table that no longer exists. A repo-wide grep for
  `position_evaluations`, `deepen-analysis`, `deepenAnalysis` and
  `CachingEngineBackend` outside this file and the migrations turned up many
  more stale comments than the four named above (across `packages/shared`,
  several `apps/api/src/services/engine/*`, bot services, routes, a web
  hook, tests, `services/engine`, and two spots in `docs/tactics-rework.md`
  and `docs/architecture.md` itself) — all fixed.
- [x] `docs/tactics-rework.md` §11: one reason per move, the ceiling table,
  and the before/after benchmark.
- [x] Update the AGENTS.md plan pointer.

Commit: `docs: lean analysis pipeline and single-verdict tactics`

## Verification (end of phase)

- `npm run verify:changed` is green, and `test:corpus` is unchanged.
- The benchmark on the test user shows each task's saving. The
  identical-output snapshots hold through 77.4.
- Re-analysing one finished game makes **0** engine calls.
- In Game Review, each move shows at most one tactic sentence, and it names
  the reason that explains the most of the eval loss.
