# AGENTS.md — Working in this repository

Instructions for AI coding agents. Follow these exactly; when a rule here conflicts with your general habits, this file wins.

## Project Overview
- **Core**: A personal AI chess coach. Users import games; a Stockfish+LLM pipeline analyzes them, and a tool-calling agent guides the user through the game.
- **Current Status**: Phases 0–9 are complete.

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
