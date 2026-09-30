# AGENTS.md — Working in this repository

Instructions for AI coding agents. Follow these exactly; when a rule here conflicts with your general habits, this file wins.

## What this project is

A personal AI chess coach: users import their games, a Stockfish+LLM pipeline
analyzes them, and a tool-calling coach agent walks the user through the game
Socratically while tracking their progress over time. Creators also turn a PGN
into a course (a lesson on the board, a YouTube video and a reel).

## Docs — read only what your task names

- `docs/plan.md` — the plan being built now: Phases 110–119. First merge the
  courses branch (a golden facts snapshot, course code in `course/`, board
  facts in `board-facts/`, pruned tests, the CodeQL alerts), then one set of
  board facts for game review, the coach and stats, and test tiers for the
  whole repo. Work one task at a time and read only that task's **Read:**
  files. Its "How to work through this plan" section applies to every task.
- `docs/architecture.md` — how everything shipped fits together (layout, DB,
  agent, courses, K8s, the "Welcome flow" at `/welcome`). Always relevant.
- `docs/courses.md` — the courses spec: the dossier (§5.4), prompts (§6),
  verifier (§7), videos (§8), learning (§11), the course, video and reel
  (§13). Only the section a task names.
- `docs/diagnose.md` — the spec behind the shipped coach diagnostics (code
  taxonomy, opportunity/episode counting, confidence, data-quality gates,
  focus selection). Long: never open it cold, only the section a task names.
- `docs/algorith.md` — the spec behind the shipped Game Report (accuracy,
  scores, classification, estimated rating, opening book). Only the
  subsection a task names.
- `docs/tactics-rework.md` — why Game Review's tactic sentences misfired and
  the layered rebuild that shipped. Read it before touching
  `tactic-detectors/`, `classify-tactic-motif.ts`, the `verify-tactic-*`
  files, `tactic-reason-text.ts`, `tactic-card-order.ts`,
  `played-tactic-alternative.ts`, `tactic-allowed.ts` or the
  tactic-prevention path. §9 is the second review pass and records one gate
  that was tried and reverted; read it before retrying that gate. Its §1
  cards are pinned in `packages/chess-analysis/src/tactic-review-cases.ts`,
  `tactic-precision.test.ts` holds the false-positive ceilings and
  `tactic-detectors/lichess-puzzle-validation.test.ts` the recall floors: a
  detector change moves all three, ceilings only go down, floors only go up.
  `tactic-detectors/README.md` is the short how-to for adding a motif.
- `docs/marketing-demo.md` — the public marketing pages (`/tour`, `/guide`,
  `/keys`, `/openai-key`), the seeded demo players, the screenshots, and the
  offline demo at `/demo`. Read it before touching `apps/web/public/*.html`,
  `apps/web/src/demo/`, `seed-demo.ts`, `scripts/capture-marketing-shots.mjs`
  or `scripts/record-demo-fixtures.mjs`.
- `docs/threat-model.md` — trust boundaries, security findings, accepted
  risks. Read it before touching auth headers, the proxy/chart config, the
  tunnel, outbound calls to user endpoints, or rate limits.

## Commands
- `npm run verify`: Full lint + typecheck + test (run before claiming a phase done).
- `npm run verify:changed`: **Fast path** — lint/typecheck/test only what changed (run after every task).
- `npm run test:changed` / `lint:changed` / `typecheck:changed`: the parts of `verify:changed`. `test:changed` runs the tests affected by files changed since `HEAD~1` (vitest `--changed`, through the root projects); `npm run test:changed -- --package api` runs one package's whole suite.
- `npm run test:corpus`: tactic precision ceilings and recall floors (opt-in tier).
- `npm run test:golden`: the course facts snapshot, no engine needed (opt-in tier; added in Phase 110). `GOLDEN_UPDATE=1` re-records it — only when a task allows it.
- `npm run course:golden -w apps/api -- --facts [--only <kind|name>]`: print the facts the course prompts get (needs the engine).
- `npm run docs:prompts`: regenerate `docs/prompts.md` after any change in `packages/prompts/src/`.
- `npm run dev`: Full local stack (Docker).
- `npm run dev:native:setup` then `npm run dev:native`: the full stack **without Docker** (sandboxes). Setup, once per box: installs Stockfish (apt), fetches Node 24 through npm if the box's Node is older than 24.15, runs `npm ci`, creates a local Postgres cluster. It needs the Postgres 16 server binaries and `redis-server` already installed. Run starts Postgres, Redis, migrations, engine, api, worker and web (`http://localhost:5173`) in the foreground with `LLM_FAKE=1` and `AUTH_MODE=dev-stub`; Ctrl-C stops all of it. State and logs live in `/tmp/fcc-native` (override with `FCC_NATIVE_DIR`). To use Node 24 in your own shell: `export PATH=/tmp/fcc-native/node/node_modules/node/bin:$PATH`. The api tests do not need the native stack; see the api test note under Testing.
- `npm run dev -w apps/api`: API only. `npm run dev:worker -w apps/api`: Worker only.
- `npm run dev -w apps/web`: Vite (web) only.
- `npm run dev -w services/engine`: Stockfish HTTP service (port 8081; needs `/usr/games/stockfish`, e.g. `sudo apt-get install -y stockfish`).
- `npm run migrate -w apps/api`: Run DB migrations.
- `npm run build:images`: Build Docker images.
- `npm run build-book -w @freechesscoach/chess-analysis`: Regenerate opening-book index.

## Per-package commands (use when working in a single package)
- `npm run test -w <pkg>`, `npm run lint -w <pkg>`, `npm run typecheck -w <pkg>`.
  - Package names: `@freechesscoach/chess-analysis`, `@freechesscoach/shared`, `@freechesscoach/prompts`, `@freechesscoach/api`, `@freechesscoach/web`, `@freechesscoach/engine`
  - `@freechesscoach/api` `db` tests (`*.db.test.ts`) start Postgres through Testcontainers and need Docker; `npm run test:unit -w @freechesscoach/api` needs neither. Without Docker, point the db tests at a local Postgres 16 (the helpers use `TEST_DATABASE_URL` and skip Testcontainers): `initdb -D /tmp/fcc-pg/data -A trust` and `pg_ctl -D /tmp/fcc-pg/data -o '-p 5433 -k /tmp' start` as the `postgres` user (`apt-get install postgresql`), then `TEST_DATABASE_URL=postgres://postgres@localhost:5433/postgres npm test -w @freechesscoach/api`. If you can do neither, say the api tests did not run; never claim they passed.

## Directory Map
- `apps/api`: Fastify 5 API + worker. Routes → Services → DB Repositories. `llm/` owns LLM provider SDKs. Course services in `services/courses/`.
- `apps/web`: React 19 + Vite SPA. Feature-folder pattern (`features/`).
- `packages/shared`: Zod schemas + inferred types (Single source of truth).
- `packages/chess-analysis`: Pure chess logic. No I/O. Inside `src/`:
  - `tactic-detectors/` — tactic motifs for Game Review and stats.
  - `diagnostics/` — the BV/MS/TA… diagnosis codes, opportunities and focus selection.
  - `move-verdict/` — move verdicts.
  - board facts — `packages/chess-analysis/src/board-facts/`: `BoardFact` data (`types.ts`) with one `renderBoardFact` (`render.ts`); what a move does, `loosePieces`, `forks`, checks, mates, material in words.
  - course code — `packages/chess-analysis/src/course/` (dossier, verify, tempting, skeletons).
- `packages/prompts`: LLM prompt templates (course prompts in `src/course/`). `docs/prompts.md` is auto-generated.
- `services/engine`: Stockfish/UCI HTTP microservice.
- `deploy/helm`: K8s Helm charts.

## Golden Rules
1. **Small named functions**: Extract `if/else` chains into named functions with early returns.
2. **One responsibility per file**: Target < 200 lines. Split files at ~250 lines.
3. **Strict Layering**: `route/tool → service → repository → DB`. SQL only in `db/repositories/`.
4. **Zod Schemas**: Types must come from `packages/shared`. Use `z.infer<>`.
5. **Pure Logic**: `packages/chess-analysis` contains pure logic (no I/O).
6. **LLM Isolation**: Only `apps/api/src/llm/` may import `ai` or `@ai-sdk/*`.
7. **React**: Components/hooks are small. Data fetching in hooks (TanStack Query).
8. **Agent Runtime**: Cache-stable prompts, append-only messages, bounded context, tool budgets.
9. **Prompt Convention**: `packages/prompts/src/` uses `buildXPrompt`/`buildXMessages`. Use `[...].filter(Boolean).join('\n\n')`.
10. **One copy of each chess idea**: chess.js first; what it lacks comes from the shared analysis code (`see()`, `pins()`, `trappedPieces()`, `PIECE_VALUES`, the board facts); where two copies exist, keep the better one and delete the other. Never write a second "is this piece hanging" check.
11. **Facts are data**: code decides from structured facts and engine lines, never by matching the English a fact renders to. Render words at the edge (prompts, UI). Course code follows this since Phase 114; the review's tactic claims still carry English (Phase 115).
12. **No backward compatibility**: rename, reshape and delete directly, and update every caller in the same change. No version fields, no code that reads an old shape, no `.optional()`/`.default()` added only so old rows parse, no deprecated aliases or re-exports under old names or paths. Stored data that no longer fits is regenerated (a rebuild script) or dropped — say which in the task.

## TypeScript Rules
- `strict: true`. No `any`, no non-null `!` (except tests). No `enum`.
- Errors: Throw typed errors from `apps/api/src/lib/errors.ts`.
- Async: No floating promises.
- Naming: `kebab-case.ts` files, verb functions, predicate booleans.

## Testing
- **Size today**: about 290 test files (2026-09-30). More tests are not better: every test must guard something that would otherwise break silently.
- **Kept, default run** (`npm test`, `verify:changed`, PR CI): invariants of pure logic; one regression test per fixed bug in shared logic, on the smallest position that shows it; permission tests on routes; schema tests; pure web logic in `.ts` files.
- **Kept, opt-in tiers** (nightly CI; run them yourself when you touch the area): `corpus` (`npm run test:corpus`), `golden` (`npm run test:golden`), and `db` (Postgres integration, below).
- **api tiers**: `apps/api` has two vitest projects. `unit` (`*.test.ts`) needs nothing running: `npm run test:unit -w @freechesscoach/api`, the fast loop, works without Docker. `db` (`*.db.test.ts`) uses Postgres (Testcontainers, or `TEST_DATABASE_URL`): a test that imports `test/helpers/db.js` must be named `*.db.test.ts`. `npm test` runs both.
- **Ephemeral**: tests that drive development and are then covered by the golden snapshot or the corpus. Name them `*.wip.test.ts` / `*.wip.test.tsx` and delete them before the task's last commit. They are never pushed: CI fails the job if `git ls-files '*.wip.test.ts' '*.wip.test.tsx'` prints anything.
- **Don't write**: assertions on the exact English of a generated sentence (the golden snapshot covers wording); `.tsx` component tests; per-detector tactic tests (the registry and corpus cover them); snapshot tests for UI; tests of wiring that TypeScript already checks.
- **Keep them fast**: build expensive fixtures (an analysed game or course) once per file, not per test; fake timers for anything that waits; no real engine or LLM in the default run.
- **Mocking**: Mock LLM (`apps/api/test/helpers/mock-model.ts`) and Engine HTTP in integration tests.
- **Workflow**: write the failing test for a new invariant or bug, make it pass, `npm run verify:changed` before committing, full `npm run verify` before a PR.

## Git
- Small commits, conventional messages.
- No secrets or large fixtures (>50 KB per file).

## Never Do
- SQL outside `db/repositories/`.
- LLM SDKs outside `llm/`.
- Raw engine evals in UI.
- Hardcode model IDs/prices/budgets.
- Edit `session_messages` (append-only).
- DB updates without Zod validation.
