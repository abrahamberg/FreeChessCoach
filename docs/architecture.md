# FreeChessCoach — Architecture


## 1. System overview

```
                        ┌─────────────────────────────────────────────┐
 Internet ──► Ingress ──► oauth2-proxy (Google + Lichess OIDC/OAuth2) │
                        └───────────────┬─────────────────────────────┘
                                        │ X-Auth-Request-* headers
                       ┌────────────────┼──────────────────┐
                       ▼                ▼                   │
                  ┌─────────┐     ┌──────────┐              │
                  │  web    │     │   api    │◄─────────────┘
                  │ (React, │     │(Fastify) │
                  │ static) │     └──┬───┬───┘
                  └─────────┘        │   │ SQL
                   serves SPA;       │   ▼
                   WASM Stockfish    │ ┌────────────┐   ┌──────────────┐
                   runs in-browser   │ │ PostgreSQL │◄──│ worker        │
                                     │ └────────────┘   │(graphile-    │
                                     │        ▲         │ worker jobs) │
                                     ▼        │         └──────┬───────┘
                              ┌────────────┐  └────────────────┤
                              │  engine    │◄──────────────────┘
                              │(Stockfish  │   HTTP (cluster-internal)
                              │ HTTP svc)  │
                              └────────────┘
             External: Anthropic API · OpenAI API · Lichess API
```

Five deployables: `web`, `api`, `worker`, `engine`, plus `oauth2-proxy` and
`postgresql` from upstream charts.

Everything behind the ingress requires an authenticated oauth2-proxy session,
with a few exceptions carved out via `--skip-auth-route`: `/` (the public
landing page, `apps/web/public/landing.html`), the marketing pages (`/tour`,
`/guide`, `/keys`, `/openai-key`, their `site.css`, `shots/` and
`sitemap.xml`; see `docs/marketing-demo.md`), the live demo (`/demo/*` and the
SPA bundle in `/assets/`; the demo runs on recorded data and makes no `/api` call), the
privacy/terms pages and
`/robots.txt`, so logged-out visitors and search-engine crawlers can look
around the site before signing in.

# Architectural Principles

### 1. Clear boundaries

```text
UI
 ↓
Routes
 ↓
Services
 ↓
Repositories
 ↓
Database
```

Rules:

- Routes contain transport logic only
- Services contain business logic
- Repositories contain all SQL
- Agent tools call services, never repositories

### 2. Shared contracts

`packages/shared` is the single source of truth for:

- API schemas
- Database JSON schemas
- Shared types

No duplicated interfaces.

### 3. Pure domain logic

`packages/chess-analysis`

Contains:

- PGN parsing
- Critical moment detection
- CP-loss classification

No network, database, or framework dependencies.

### 4. Stateless infrastructure

Services should remain stateless where possible:

- API
- Worker
- Engine

PostgreSQL is the primary state store.

---

# Core Components

## Web

Responsibilities:

- Game import
- Dashboard
- Coaching session UI
- Chessboard interaction
- Streaming chat

Browser Stockfish is UX-only and never authoritative.

### Browser tunnel

Every signed-in tab keeps one WebSocket open to `GET /api/tunnel`
(`useUnifiedTunnelActivation`, whatever the engine mode or AI setup). The
server sends it requests with a `requestId`, and the tab answers. There are
three kinds, with message shapes in `packages/shared/src/tunnel.ts`:

- `engine`: WASM Stockfish in the tab. That is the lite supplement for every
  engine mode, plus Browser mode's main engine.
- `fetch`: chess-api.com calls made from the user's IP (chess_api mode).
- `llm`: calls to a local LLM server (see "Local LLM").

The route registers the socket under the **authenticated** user only, never
an id the client supplies. A registered socket receives that user's prompts
and answers their engine requests. Every open tab stays registered, background
tabs included. New requests go to the tab the user used most recently: a tab
sends `active` with its last-used time on connect and whenever the user loads
a page in it, switches to it, clicks or types (`engine/tunnel-tab-usage.ts`),
because a tab left in the background can be throttled or frozen and never
answer. A request already sent stays with its tab. When a tab closes, only its own requests fail, and the
next most recently active tab takes over. On connect, the route re-enqueues the user's paused analyses. The registry
(`services/engine/unified-tunnel-registry.ts`) lives in the api process; the
worker reaches it through `POST /internal/engine-tunnel/:userId`. The topbar
dots next to the engine pill show the tunnel's health (red down, yellow
connecting/loading, green ready), plus a "Local AI" dot for local setups.

## API

Responsibilities:

- Authentication
- Session management
- Agent orchestration
- LLM gateway
- SSE streaming

The API owns the coaching experience.

## Worker

Responsibilities:

- Background game analysis
- Session summarization
- Long-running tasks

## Engine

Responsibilities:

- Stockfish evaluation
- Position analysis
- Game analysis

Single purpose service.

## Lichess evaluation index

A read-only, pre-built lookup is the first stage of the one engine pipeline
used by every caller: game review, coach positions, hints, and Play vs Bot.
The priority contract is:

```text
Lichess eval index
    ↓ miss only
user-selected method (chess_api, native, or browser-full)
    ↓ unavailable only
configured reliable fallback (native where applicable)
    ↓ too few candidate lines only
browser-lite breadth supplement
```

`LichessEvalEngineBackend` is the outermost decorator, so any index hit
returns immediately and never invokes the selected method, a fallback, or
browser-lite. The bot's move algorithm receives the resulting reliable
candidate lines and is responsible for intentional mistakes; engine
selection and bot weakening are separate concerns.

The index contains positions the Lichess community has already evaluated
(~394M positions, published at https://database.lichess.org/#evals, CC0). A
hit skips the live engine call entirely and is never written to
`position_evaluations`: that table exists to cache the app's own
selected/fallback engine calls, and duplicating data already durably available
here would only cost storage for no benefit. A miss falls through to the next
pipeline stage. Bot searches bypass only the FEN-only cache because their
requested depth and candidate breadth differ; they do not bypass any
source-priority stage.

Deliberately **not** a database engine: the data is immutable at runtime
(read-only lookups by FEN, no writes), so this is a single sorted,
fixed-width binary file (`packages/chess-analysis/src/lichess-eval-index-format.ts`
for the record layout, `apps/api/src/services/engine/lichess-eval-index.ts`
for the binary-search reader) — a plain binary search against an open file
descriptor, no server process, no native dependency (respects
`docker/Dockerfile.api`'s "pure JavaScript, no native binaries" invariant).
Same spirit as the opening-book index
(`packages/chess-analysis/src/generated/opening-book-index.json`) — a
read-only static data asset, not app state — just far too large (~10GB) to
bundle into the image the way that one is.

Built and refreshed **independently of app deploys, entirely by hand**:
`apps/api/scripts/build-lichess-eval-index.mjs`
(`npm run build-lichess-eval-index -w @freechesscoach/api`) is a standalone
offline pipeline, run on a developer's own machine — never wired into
`build:images`, the Helm migrate-job, or any CI workflow. There is no object
storage in this deployment, so the built file is copied once via `kubectl cp`
onto a `PersistentVolumeClaim` (`deploy/helm/freechesscoach/values.yaml`'s
`lichessEvalIndex` block, disabled by default) that `api`/`worker` mount
read-only — a normal app deploy (new image tag via ArgoCD) or pod restart
never touches this volume, so refreshing the dataset and shipping an app
change are fully decoupled operations, and the multi-GB file is never
committed to git or uploaded as part of any pipeline. If the PVC exists but
hasn't been populated yet, `openLichessEvalIndexFromEnv`
(`apps/api/src/bootstrap.ts`) logs a warning and returns null rather than
crash-looping the pod — `resolveEngineBackend` simply skips this tier until
the file shows up. See `apps/api/data/README.md` for the build/copy steps.

---

# Analysis Flow

```text
Import PGN
    ↓
Queue Analysis
    ↓
Engine Evaluation
    ↓
Move Classification
    ↓
Diagnostics / Game Report Ready
```

Purely mechanical — no LLM call, no BYOK-unlock dependency, so importing and
reviewing games is always free. The coaching plan is *not* produced here; see
Coaching Flow below.

Output:

- Engine evaluations
- Game report / diagnostics
- Learning themes

---

# Import Limits, Library Cap and the Stats Archive

Importing is metered, and deleting a game never costs the user their stats.

## Limits

All limits are constants in `packages/shared/src/import-limits.ts`, shared
with the web UI so copy can never disagree with the server:

| Limit | Value | Counts |
|---|---|---|
| Daily | 30 | imports in the last 24h (rolling) |
| Weekly | 150 | imports in the last 7×24h (rolling) |
| In flight | 10 | analyses still `queued`/`engine_running`/`planning`/`paused` |
| Library | 1000 | imported-source games (paste/upload/lichess/chesscom) |

- **Daily/weekly count an append-only ledger**, `game_import_events`
  (`0041_game_import_events.ts`, `db/repositories/game-import-events.ts`): one
  row per *new* import, written in the same transaction as the game insert
  (`services/imported-game-record.ts`). It has no link to `games`, so deleting
  a game cannot free quota; coach/bot games never write to it. A duplicate PGN
  is not a new import and is never blocked.
- **In flight** is `analysesRepo.countInFlightForUser`. `paused` counts: it is
  the state a game sits in while the browser tunnel is disconnected, i.e.
  analysis only completes while the tab is open. It is a soft cap (two tabs
  importing at the same instant can reach 11).
- `importAllowance` (`packages/shared/src/import-allowance.ts`) is the one
  calculation the server enforces with (`services/import-quota.ts`,
  `assertCanImport`) and the picker caps selection with. A blocked import is a
  429 problem+json whose `limit` field is `daily` | `weekly` | `in_flight`.
- `GET /api/games/import-quota` returns all of it in one object, including
  `library.autoDeleteCount`.

## Library cap

An import at 1000 imported games first deletes the 50 *earliest* (the same
`deleteEarliestImportedInTransaction` the manual "delete earliest 50" uses),
then inserts — one transaction, so a failing insert deletes nothing. The
import page warns first (`AutoDeleteNotice`), single-game imports included.

## Stats survive deletion

Stats are computed from stored per-game reports, so a deleted game used to
vanish from the Stats page. Now every delete of an imported game folds it into
`stats_archive_weeks` first (`services/stats-archive.ts`, `bankGameStats`),
keyed (user, ISO week start — Monday UTC, speed):

- The row holds a `StatsBucket` (`packages/shared/src/stats-bucket.ts`):
  *sums and counts*, never means, so buckets merge by addition. Rating is the
  exception in shape only: an archived week is one trend point at its mean
  estimate rather than one point per game.
- `buildStatsDashboard(entries, archivedWeeks)` is
  `finalize(merge(reduce(entries), archive))`
  (`packages/chess-analysis/src/{stats-bucket,merge-stats-buckets,finalize-stats-dashboard}.ts`).
  `stats-dashboard-reference.ts` is a frozen copy of the old per-game code,
  used only by tests to prove the new pipeline gives identical numbers.
- The dashboard and the tactic baseline note (`getGameTacticBaselineNote`)
  both read the archive. The coach's recent-games stats
  (`coach-player-stats.ts`) deliberately do not: they look at the newest 20
  games, which deletion of the *earliest* games does not touch.
- **Every deletion path goes through `deleteGameKeepingStats`**
  (`services/games.ts`); only account deletion calls the bare
  `cascadeDeleteGame`, and it also wipes the archive and the ledger. Games
  deleted before this shipped cannot be archived.
- Archived data is week-granular, so `last7`/`last30` may include a whole
  archived week that only partly overlaps the range.

## Recommended coaching game

After a batch import finishes analyzing, `GET /api/games/coaching-candidate`
picks the batch's game with the most *tactical points* — tactics missed plus
tactics the opponent had that the player did not defuse
(`chess-analysis/src/coaching-candidate.ts`, weights in `CONFIG`). No AI is
involved; absent `preventable`/`prevented` (old reports) count as 0.

## Bot Thinking log

The log is opt-in per session (0043_bot_thinking_log.ts): a play_bot session
records traces only while its `bot_thinking_log` flag is on — off by default,
toggled from the bot session page's header overflow menu ("Show/Hide thinking
log", POST /api/sessions/:id/bot-thinking-log). While off, the bot's commit
paths never start a trace, so no registry entry, no Redis mirror write and no
client polling happen at all; the GET route serves an empty log. Enabling
takes effect from the next move on (nothing is recorded retroactively).

A bot move is one synchronous round trip (`commitBotTurn` /
`requestBotMove`, `apps/api/src/services/bot/bot-move-commit.ts`). To see what
a slow or stuck move is doing, each move records a *trace*
(`bot-move-trace.ts`): timed steps — saving the player's move, book lookup,
each engine attempt and retry wait, the main engine and light-supplement
calls, the choice (with the branch and rolls, and the on-demand annotation of
the few candidates it weighs), the think-time padding, saving. Traces are kept
in memory (`bot-thinking-registry.ts`: last 60 moves per session, 200 sessions) and, in a
multi-pod deployment, are mirrored to Redis (`bot-thinking-mirror.ts`) so a poll
landing on any pod sees every pod's moves; entries expire after an hour and a
restart shows less history — it is a diagnostic view, not game data. `GET /api/sessions/:id/bot-thinking` returns them
(`BotThinkingLogSchema`, `packages/shared/src/bot-thinking.ts`), and the bot's
status panel polls it while the bot is thinking (`BotThinkingPanel`). It
records timing and move names, never raw engine evaluations. The console-side
`DEBUG_LOG=bot_move` line is separate and only prints after a move is chosen.

### Bot move selection

A bot move is decided from three rolls drawn before the engine is asked
(`bot-move-pick.ts`), so the one real-engine search is sized to the branch: five
lines for a top-moves branch (the best move, or another of the five), one line
for a miss. A miss is chosen without the engine — plausible mistakes near what
the student just played (`bot-mistake-pool.ts`) — and then checked with it, one
candidate at a time (`bot-mistake-search.ts`: the light engine, else a small
search on the bot's own engine), until one really is as bad as wanted, judged in
win percentage (`bot-mistake-judge.ts`) — or in centipawns when the bot is far
ahead, where the win percentage has flattened. A far-behind bot plays its best
move. Anything that decides the bot's move uses the real engine
pipeline; the light engine is only for the quick check and for rating.

Every bot plays its first two moves from the opening book (while the game is
in it), and moves the book knows are labelled `book` without an eval.

Each move is saved with the engine's eval of the position it leaves, in its PGN
`[%eval]` comment, so returning to a position (undo, a resumed game) never needs
the engine again.

### Rating a bot turn

Both moves of a bot turn are saved **unrated** first (`commitMoveUnrated`,
`services/play-moves-rated.ts`), so neither the bot's reply nor the session
pointer waits on an engine call for a label. Ratings are filled in afterwards
by `rateLastMove` (it only ever edits the game's last move, under the game
lock) and make **no engine call**: the student's move uses the bot's own search
for its "after" eval and a light-engine eval of the position it was played from
for "before"; the bot's move uses the same search alone. That light-engine eval
is computed in the background after each bot reply and kept in a shared
`RatingEvalStore` (`bot-rating-evals.ts`) — Redis in deployments (the API runs
as several pods, so a per-process map would miss), never the
`position_evaluations` cache, whose rows are trusted at any depth. When an eval
is missing (first move, no browser tab, book reply) the move is unrated
(`quality: null` in the response); post-game analysis still rates every move at
standard depth.

---

# Coaching Flow

```text
User Message
      ↓
Coach Agent
      ↓
Tools
      ↓
Service Layer
      ↓
Database / Engine
```

The first turn of a game's first coaching session generates and persists its
coaching plan (`services/coaching-plan.ts`'s `ensureCoachingPlan`) before the
system prompt is built — lazily, not at import time, and only once per game.
This is also the point where a BYOK unlock first becomes required for that
game, no earlier than the turn's own model resolution already required it.

The coach follows a Socratic teaching model:

- Ask questions first
- Guide discovery
- Explain only after student reasoning

---

# Agent Design

The coaching agent is the product's core capability.

### Model tiers

**Standard**

- Live coaching conversations

**Light**

- Analysis planning
- Summarization
- Context compression
- Engine interpretation

### User-supplied LLM setup

The app is bring-your-own-key and accepts one complete JSON setup: endpoint,
API key, low model, high model, optional voice model, and (Advanced) a
thinking level per tier. Before saving, the API probes each text model on its
own (`llm/compatibility-test.ts`), trying OpenAI Responses, then Anthropic
Messages, then Chat Completions, and keeps the first format that answers. Each
probe carries one trivial function tool, because a format that passes a plain
prompt can still reject tools, and every coaching turn sends tools. gpt-5.4+
models never fall back to Chat Completions. The two models may end up with
different formats (e.g. a Claude and a GPT model through OpenRouter): the
stored setup has `lowProtocol`/`highProtocol`, and `protocol` (the high
model's) is what setups saved before per-model detection use for both
(`gateway.ts` `resolveTierProtocol`). The setup is stored as AES-256-GCM
ciphertext. The key is derived from the user's unlock phrase with scrypt;
neither the phrase nor the plaintext setup is stored in PostgreSQL.

Thinking level: unset means the deployment tuning (`model-options.ts`,
`standard: medium`, `light: none`); a user's level for a tier replaces it for
that tier only.

An unlock places the plaintext setup in a short-lived Redis cache under an
HMAC-derived user name. The cache value is encrypted with a deployment cache
key and expires after inactivity, so a database or Redis dump alone does not
recover a provider key. API and worker share this cache for active background
jobs; users can also lock it immediately from Settings. Omitting the voice
model disables cloud voice while leaving browser voice available.

### Coach voice (TTS)

`users.tts_enabled` (off by default) plus `users.tts_backend`, one of three
clients behind `apps/web/src/tts/resolve-tts-client.ts`:

- `openai`: the browser calls `POST /api/tts/speak`; the API synthesizes with
  the user's own OpenAI key (`llm/openai-tts.ts`).
- `browser`: Kokoro on WASM in a worker (`kokoro-worker.ts`). Free but runs
  slower than real time on most CPUs, so sentences arrive with gaps.
- `local`: the browser calls a Kokoro-FastAPI server the user runs on their own
  machine (`local-tts-client.ts`, `POST <address>/v1/audio/speech`, one request
  per sentence). It never touches this app's API, so it works when the app is
  hosted too. The server is always `http://localhost:<port>`; the port (default
  8880) is per-device (`localStorage`, `local-tts-settings.ts`) and set under a
  collapsed "Advanced" section in `features/settings/LocalVoiceSetup.tsx`, which
  also links to the one-time setup steps in the user guide (`/guide#voice`,
  Docker and terminal, Windows and Mac). Only Kokoro-FastAPI is documented:
  it enables CORS for all origins by default, which a direct browser call needs.

Microsoft's unofficial Edge voices were evaluated and not shipped. Their
WebSocket endpoint only accepts a User-Agent containing `Edg/`, which a browser
page can't set on a WebSocket (Chrome/Firefox get 403), and the local
`openai-edge-tts` wrapper sends no CORS headers.

### Local LLM (LM Studio / Ollama)

A setup with `protocol: 'local'` points at an OpenAI-compatible server on the
user's own machine. The server can't reach the user's localhost, so every call
goes through their browser tab: API → tunnel → tab `fetch` → local server →
back (`llm/local-model.ts`, `apps/web/src/engine/tunnel-llm-handlers.ts`).
The local server must allow the site's origin (LM Studio: "Enable CORS";
Ollama: `OLLAMA_ORIGINS`).

- **Streaming.** The coach's `doStream` streams for real: the tab forwards
  each SSE `data:` payload as a tunnel frame, and `llm/local-stream.ts` maps
  them to AI SDK parts, including thinking (`reasoning_content` or an inline
  `<think>` block) as reasoning deltas. `doGenerate` (structured output,
  summaries) waits for the whole answer and sends the JSON schema as
  `response_format`.
- **One call at a time.** A local server answers one request at a time, so
  `LlmCallQueue` (`services/engine/llm-call-queue.ts`) serializes a user's
  local calls in the api process. Streams (the coach) go ahead of queued
  whole-answer calls (summaries). Worker calls come over the internal relay
  (`RelayLlmTunnelTransport`) and join the same queue.
- **Thinking off by default.** Unless the user picks a level, local calls send
  `reasoning_effort: 'none'` plus `chat_template_kwargs.enable_thinking: false`.
  A server that rejects those fields gets requests without them from then on.
- **No planner call.** For a local setup the coaching plan is built from the
  engine review (`services/local-coaching-plan.ts`) and not stored, so the
  coach's first reply is the session's first LLM call. Its `sessionGoal` is
  a short, deterministic sentence derived from the picked moments' `kind`
  (never blank) — a real planner call gives a cloud setup a richer,
  evidence-specific one instead. Restated every turn via `suggestedGoalLine`
  (`packages/prompts/src/coach-system.ts`), it's the one durable anchor a
  small model has for what the session is actually working on, since it
  otherwise has to both invent a goal itself and remember its own earlier
  statement of it with nothing to check itself against.
- **Lighter prompt.** `CoachPromptInput.isLocal` (threaded from the standard-
  tier model resolution, `coach-agent-turn.ts`) shapes two parts of the
  per-turn prompt for a local model, which reads the same prompt as a cloud
  model but with a fraction of the context and no reliable reasoning pass
  over it: `yourToolsAndWhenToUseThem` collapses each tool's full prose
  description — already sent verbatim as that tool's own function-calling
  schema description — to a one-line cue (`render.ts`'s `briefToolCue`),
  cutting the static system prompt by roughly a third; and the annotated-PGN
  block (`episode-context.ts`'s `renderAnnotatedPgn`/`renderGameSoFarInline`,
  `simple: true`) drops the NAG-glyph/cp-loss/stacked-reasons annotation
  (e.g. "Nxd5?? (lost ~277cp, best Nb4; ...; ...)") for plain SAN with a bare
  English quality word on the moves that cost something — the dropped detail
  is exactly what "## Current position" already gives the coach, one move at
  a time, when it actually shows that position. Both were observed
  confusing a small quantized local model into losing track of basic game
  facts (who won, what was actually played). The game's own result is also
  spelled out in plain English for every setup, local or cloud
  (`coach-system.ts`'s `resultSentence`) — the raw PGN token ("1-0") alone
  was part of the same failure.
- **Limits.** `LOCAL_LLM_TIMEOUT_MS` (whole answer, default 10 min) and
  `LOCAL_LLM_STREAM_IDLE_MS` (silence between stream frames, default 3 min).
  The setup test reads the loaded model's context window where the server
  reports it and warns below 16k tokens, which is about what the coach's
  prompt and tools need.

### Tool constraints

Tools may:

- Read profile data
- Query engine analysis
- Record findings
- Update coaching state

Tools may not:

- Execute SQL
- Bypass services
- Access infrastructure directly

---

# Data Ownership

| Data | Owner |
|--------|--------|
| Users | API |
| Games | API |
| Analyses | Worker |
| Sessions | Coach Agent |
| Findings | Progress Service |

---

# Key Invariants

### Session history is append-only

Messages are never edited or deleted.

### One analysis per game

A game cannot have multiple completed analyses.

### Coaching state is durable

Sessions can be resumed after disconnects or restarts.

### Engine is authoritative

The Lichess index and the selected/fallback main engine stages are trusted
sources for the pipeline contract. Browser-lite is supplementary only: it can
add candidate lines, but it never replaces the main source's top line and is
never used as the official cached evaluation.

### Context remains bounded

Large conversations are summarized and compacted.

Raw history remains stored.

### Deleting a game never loses its stats

Any code that deletes an imported game goes through `deleteGameKeepingStats`,
which folds the game into the weekly archive first. Only account deletion may
call the bare `cascadeDeleteGame`.

### Import quota is never derived from `games`

Daily/weekly limits count `game_import_events` only, so deleting a game cannot
reopen quota. Limit numbers live in `packages/shared/src/import-limits.ts`; a
literal 10/30/150/1000 anywhere else is a bug.

### `preventable`/`prevented` are absent, not zero, on old reports

Every aggregation over tactic counts (stats buckets, the recommended-game
score) must keep them absent rather than 0 when no game reported them.

---

# Deployment Units

```text
web
api
worker
engine
postgres
oauth2-proxy
```

Each service is independently deployable.

---

# Repository Structure

```text
apps/
  web/
  api/

services/
  engine/

packages/
  shared/
  chess-analysis/
  prompts/
```

Dependency rules:

```text
packages/*
    ↑
apps/*
```

Packages never depend on applications.

---

# Future Evolution

Expected growth areas:

- Additional chess providers
- New coaching modes
- Stronger progress tracking
- Multi-game training plans
- Mobile clients

Core architecture should remain:

```text
Web
 ↓
API
 ↓
Services
 ↓
Repositories
 ↓
Database
```
