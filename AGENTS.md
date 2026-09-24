# AGENTS.md — Working in this repository

Instructions for AI coding agents. Follow these exactly; when a rule here conflicts with your general habits, this file wins.

## What this project is

A personal AI chess coach: users import their games, a Stockfish+LLM pipeline
analyzes them, and a tool-calling coach agent walks the user through the game
Socratically while tracking their progress over time. The initial build
(Phases 0–9) is complete and merged — read before coding:

- `docs/architecture.md` — how it fits together (layout, DB, agent, K8s). Always relevant.
- `docs/plan.md` — the implementation plan for whatever is being built next.
  Currently Phase 73, bot latency diagnosis (instrumentation + a benchmark to
  find out why bot moves are slow or hang; no behaviour changes). The
  in-app Thinking log (Tasks 73.1–73.2) has shipped and is described in
  `docs/architecture.md` ("Bot Thinking log"); 73.3–73.6 are open. Phase 74
  (same file) reworks how a bot turn spends time: rating off the critical
  path (74.1–74.6 shipped: branch-first engine requests, mistake-first move
  choice, saved evals). Phase 75 (same file) is the review and fix list
  for the unified tunnel and local LLM work (75.1–75.10 implemented, uncommitted; live verification open). Phase 76
  (same file) makes every tactical verdict and diagnostic failure
  eval-witnessed (`eval-witness.ts`) and redefines diagnostic
  opportunities/failures so the Progress counts mean something. Phase 77
  (same file) is leaner analysis: stored engine evals reused on re-analysis
  and resume, and one tactical verdict per move (77.1–77.5 implemented,
  uncommitted; 77.6 docs). The last
  shipped plan (import limits, stat archive, guided import; Phases 67–72) is
  described in `docs/architecture.md`. Open the plan, find the one
  Phase/Task being worked on, and read only that task's **Read:** files.
- `docs/diagnose.md` — the spec behind the *shipped* programmatic coach
  diagnostics (code taxonomy, opportunity/episode counting, confidence,
  data-quality gates, focus selection). Long; never open it cold or read it
  end-to-end — only the one section a task explicitly points you at.
- `docs/algorith.md` — the spec behind the *shipped* Game Report (accuracy,
  scores, classification, estimated rating, opening book). Same rule: only
  open the one subsection a task's "Read:" line names, never cold.
- `docs/marketing-demo.md` — the public marketing pages (`/tour`, `/guide`,
  `/keys`, `/openai-key`), the seeded demo players, how the screenshots
  are captured, and the offline live demo at `/demo` (`apps/web/src/demo/`, a
  fake `fetch` over recorded fixtures with a scripted coach). Read it before
  touching `apps/web/public/*.html`, `apps/web/src/demo/`, `seed-demo.ts`,
  `scripts/capture-marketing-shots.mjs` or `scripts/record-demo-fixtures.mjs`;
  irrelevant otherwise.
- `docs/tactics-rework.md` — why Game Review's tactic sentences misfired, what
  was measured, and the layered rebuild that shipped. Read it before touching
  `tactic-detectors/`, `classify-tactic-motif.ts`, the `verify-tactic-*`
  files, `tactic-reason-text.ts`, `tactic-card-order.ts`,
  `played-tactic-alternative.ts`, `tactic-allowed.ts`, or the
  tactic-prevention path; irrelevant to everything else. §9 is the second
  review pass (which sentence leads, what a move handed over, an equally good
  move of the player's own, the vocabulary for a trade) and records one gate
  that was tried and reverted — read it before re-trying that one. Its §1 cards are pinned as fixtures in
  `packages/chess-analysis/src/tactic-review-cases.ts`,
  `tactic-precision.test.ts` holds the false-positive ceilings and
  `tactic-detectors/lichess-puzzle-validation.test.ts` the recall floors — a
  detector change is expected to move all three, the ceilings only go down and
  the floors only go up. `tactic-detectors/README.md` is the how-to for adding
  a motif and is the shorter read when that is all you need.

## Key Documentation (Read only as needed)
- `docs/architecture.md`: System layout, DB, agent, K8s. (Always relevant for high-level context).
- `docs/plan.md`: The implementation plan for the current work. Only read the specific Phase/Task being worked on.
- `docs/diagnose.md`: Spec for programmatic coach diagnostics. Read only the specific section requested by a task.
- `docs/algorith.md`: Spec for the Game Report. Read only the relevant subsection requested by a task.
- `docs/marketing-demo.md`: Public marketing pages, demo data, and capture scripts. Read before touching `apps/web/public/` or demo scripts.
- `docs/tactics-rework.md`: Tactic detection rebuild details. Read before touching `tactic-detectors/` or related logic.

## Commands
- `npm run verify`: Full lint + typecheck + test (run before claiming any task done).
- `npm run verify:changed`: **Fast path** — only lint/typecheck/test packages with git changes.
- `npm run test:changed`: Only test changed packages.
- `npm run lint:changed`: Only lint changed packages.
- `npm run typecheck:changed`: Only typecheck changed packages.
- `npm run dev`: Full local stack (Docker).
- `npm run dev -w apps/api`: API only.
- `npm run dev:worker -w apps/api`: Worker only.
- `npm run dev -w apps/web`: Vite (web) only.
- `npm run dev -w services/engine`: Stockfish HTTP service.
- `npm run migrate -w apps/api`: Run DB migrations.
- `npm run build:images`: Build Docker images.
- `npm run build-book -w @freechesscoach/chess-analysis`: Regenerate opening-book index.

## Per-package commands (use when working in a single package)
- `npm run test -w <pkg>`: Run tests for one package.
- `npm run lint -w <pkg>`: Lint one package.
- `npm run typecheck -w <pkg>`: Typecheck one package.
  - Package names: `@freechesscoach/chess-analysis`, `@freechesscoach/shared`, `@freechesscoach/prompts`, `@freechesscoach/api`, `@freechesscoach/web`, `@freechesscoach/engine`

## Directory Map
- `apps/api`: Fastify 5 API + worker. Routes → Services → DB Repositories. `llm/` owns LLM provider SDKs.
- `apps/web`: React 19 + Vite SPA. Feature-folder pattern (`features/`).
- `packages/shared`: Zod schemas + inferred types (Single source of truth).
- `packages/chess-analysis`: Pure chess logic (PGN parsing, etc.). No I/O.
- `packages/prompts`: LLM prompt templates. `docs/prompts.md` is auto-generated.
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

## TypeScript Rules
- `strict: true`. No `any`, no non-null `!` (except tests). No `enum`.
- Errors: Throw typed errors from `apps/api/src/lib/errors.ts`.
- Async: No floating promises.
- Naming: `kebab-case.ts` files, verb functions, predicate booleans.

## Testing Strategy
- **Approach**: Light TDD for critical paths only. Write tests for core logic (pure functions, domain invariants, regression cases).
- **Scope**: ~120 test files across 6 packages (down from 1000+). Focus on:
  - `packages/chess-analysis`: Pure chess logic, diagnostics, game report
  - `packages/shared`: Zod schemas, diagnosis types
  - `packages/prompts`: Prompt rendering, coach system
  - `apps/api`: Core services (coach-agent, analysis, game-import, engine-client), DB repos, routes
  - `apps/web`: Engine cache, coach hooks
  - `services/engine`: UCI parser, engine pool, analyze
- **Workflow**:
  1. Write failing test for new critical behavior
  2. Make it pass
  3. Run `npm run verify:changed` before committing
  4. Full `npm run verify` before PR/merge
- **Mocking**: Mock LLM (`apps/api/test/helpers/mock-model.ts`) and Engine HTTP in integration tests.
- **No**: Snapshot tests for UI, granular component tests, per-detector tactic tests (covered by registry + corpus).
- **Philosophy**: Full TDD generated ~1000 low-value tests that slowed development. We keep TDD only for critical paths (pure logic, regressions). For UI, integrations, and glue code — write tests after or skip; rely on type safety and manual verification.

## Git
- Small commits, conventional messages.
- No secrets or large fixtures (>50 KB).

## Never Do
- SQL outside `db/repositories/`.
- LLM SDKs outside `llm/`.
- Raw engine evals in UI.
- Hardcode model IDs/prices/budgets.
- Edit `session_messages` (append-only).
- DB updates without Zod validation.