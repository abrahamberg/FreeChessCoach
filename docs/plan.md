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
