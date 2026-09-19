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
API key, low model, high model, and optional voice model. On save, the API
makes tiny independent probes for the OpenAI Chat/Responses and Anthropic
Messages formats, then stores the setup as AES-256-GCM ciphertext. The key is
derived from the user's unlock phrase with scrypt; neither the phrase nor the
plaintext setup is stored in PostgreSQL.

An unlock places the plaintext setup in a short-lived Redis cache under an
HMAC-derived user name. The cache value is encrypted with a deployment cache
key and expires after inactivity, so a database or Redis dump alone does not
recover a provider key. API and worker share this cache for active background
jobs; users can also lock it immediately from Settings. Omitting the voice
model disables cloud voice while leaving browser voice available.

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
