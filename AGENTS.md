# AGENTS.md — Working in this repository

Instructions for AI coding agents (and humans). Follow these exactly; when a rule
here conflicts with your general habits, this file wins.

## What this project is

A personal AI chess coach: users import their games, a Stockfish+LLM pipeline
analyzes them, and a tool-calling coach agent walks the user through the game
Socratically while tracking their progress over time. The initial build
(Phases 0–9) is complete and merged — read before coding:

- `docs/architecture.md` — how it fits together (layout, DB, agent, K8s). Always relevant.
- `docs/plan.md` — remaining work: programmatic coach diagnostics (the
  `docs/diagnose.md` code taxonomy, opportunity/episode counting, confidence,
  data-quality gates, focus selection). Only relevant when a task touches
  that feature — irrelevant to everything else in the repo, do not read it
  otherwise. When it is relevant: open it, find the one Phase/Task being
  worked on, and read only that task's `docs/diagnose.md` section per its own
  "Read:" pointer — never open `docs/diagnose.md` cold or read it end-to-end;
  it's long and most of it won't apply to any single task.
- `docs/algorith.md` — the spec behind the *shipped* Game Report (accuracy,
  scores, classification, estimated rating, opening book). Same rule: only
  open the one subsection a task's "Read:" line names, never cold.


## Commands

- `npm run lint && npm run typecheck && npm test` — root-level, covers every
  workspace; run before claiming any task done.
- `npm run dev` — full local stack via docker compose (postgres, engine, api,
  worker, web-dev); `npm run dev:down` to stop.
- Single-workspace dev servers (bypass docker): `npm run dev -w apps/api`
  (API), `npm run dev:worker -w apps/api` (worker), `npm run dev -w apps/web`
  (Vite), `npm run dev -w services/engine` (Stockfish HTTP service).
- `npm run migrate -w apps/api` — run DB migrations directly.
- `npm run build:images` — build all Docker images (`scripts/build-images.sh`).
- `npm run build-book -w @freechesscoach/chess-analysis` — regenerate the checked-in
  opening-book index only after refreshing `packages/chess-analysis/data/openings.tsv`.

## Directory map

- `apps/api` — Fastify 5 API + worker: routes (thin adapters) → services
  (business logic, incl. the coach agent) → db/repositories (all SQL,
  Kysely). `llm/` is the only place allowed to call LLM provider SDKs.
- `apps/web` — React 19 + Vite SPA, feature-folder pattern
  (`features/{board,chat,dashboard,games,import,session,settings}`).
- `packages/shared` — zod schemas + inferred types; single source of truth
  for API/DB shapes.
- `packages/chess-analysis` — pure chess logic (PGN parsing, move
  classification, position features); no I/O.
- `packages/prompts` — LLM prompt templates/builders, the single source of
  truth for prompt text. `docs/prompts.md` is *generated* from it (`npm run
  docs:prompts`) — never hand-edit that file.
- `services/engine` — standalone Stockfish/UCI HTTP microservice.
- `deploy/helm` — Kubernetes Helm chart for deploy.
- `docs/` — see the reading list above.

## Golden rules

1. **Small named functions over nested conditionals.** If you are writing an
   `if/else` chain or nesting deeper than 2 levels, extract each branch's meaning
   into a named function and use early returns. The name documents the intent.

   ```ts
   // BAD
   if (analysis.status === 'ready') { if (session) { ... } else { ... } } else { ... }

   // GOOD
   if (!isAnalysisReady(analysis)) return respondAnalysisPending(reply, analysis);
   if (hasActiveSession(game)) return resumeSession(reply, game);
   return createSession(reply, game, user);
   ```

2. **One responsibility per file.** Target < 200 lines. A file named
   `game-import.ts` that also meters credits is wrong. When a file grows past
   ~250 lines, split it as part of your change.

3. **Layering is strict.** `route/tool → service → repository → DB`.
   - SQL (kysely) exists **only** in `apps/api/src/db/repositories/`.
   - Services own invariants (max-3-active focus areas, enum checks, dedup).
   - Routes and agent tools are thin adapters: parse/validate → call service →
     shape response. If you're writing a query anywhere else, stop and move it.

4. **Types come from `packages/shared` zod schemas.** Never hand-write an
   interface that duplicates a schema; use `z.infer<>`. Every API body and jsonb
   column has a schema there. New data shape → new schema first.

5. **Pure logic goes in `packages/chess-analysis`** (no I/O, no imports from
   apps). If a function could be tested with plain inputs/outputs, it belongs
   there or in a `lib/` folder — not inline in a service.

6. **Nothing outside `apps/api/src/llm/` may import `ai` or `@ai-sdk/*`.** That
   directory owns the whole provider surface: `gateway.ts` (BYOK resolution,
   tier→model mapping, metering, logging), `model-options.ts` (reasoning
   effort, OpenAI service tier), `chat.ts`/`text.ts` (the only `streamText`/
   `generateText`/`generateObject` calls), `messages.ts`, `tools.ts`,
   `stream-response.ts`, `usage.ts`. Services take app-owned types
   (`ChatMessage`, `TurnUsage`, `CoachTurnStream`) and never see SDK ones.
   `apps/web` gets exactly one exception, `hooks/coachStream.ts`, for reading
   the wire format. Check it:

   ```sh
   grep -rn "from 'ai'\|@ai-sdk/" apps/api/src packages services --include=*.ts | grep -v "apps/api/src/llm/"
   ```

   This is what keeps the next SDK major a handful of files instead of thirty.
   Prompt text lives only in `packages/prompts`. `docs/prompts.md` is
   generated from it (`npm run docs:prompts`), not hand-maintained —
   `packages/prompts/scripts/generate-doc.test.ts` fails `npm test` if the
   checked-in doc drifts from a fresh generation, so run that script after
   any prompt-text change instead of hand-editing the doc.

7. **React: components + hooks, small.** Presentational components in
   `components/` take props and render — no fetching. Data fetching lives in
   hooks (`hooks/`, TanStack Query). Feature folders compose them. A component
   over ~120 lines gets split. No prop-drilling deeper than 2 levels — restructure
   or use context.

8. **The coach agent's runtime discipline is code-review material**
   (architecture §7.4): cache-stable prompt segments, append-only messages,
   bounded replay context with digest, per-turn tool budgets and loop breakers,
   and light-tier subagents for anything mechanical. If a tool result would put
   raw engine lines, JSON rows, or >~120 words of non-conversational data into
   the coach's context, digest it with a light subagent first. Breaking
   cache-friendliness is a bug even if the output looks correct.

9. **Prompt files follow one convention** (`packages/prompts/src/`) — this is
   what keeps a large prompt-text rewrite from turning into copy-paste
   spaghetti. Every prompt builder file:
   - Exports one `buildXPrompt`/`buildXMessages` (or `renderX`) function per
     concern — one file per prompt in the inventory (see docs/prompts.md).
   - Gives each logical section its own named constant or small function
     (`coach-system.ts`'s `WHO_YOU_ARE`, `FORMATTING`, `howYouRunTheSession()`,
     ...) — never inline string-builds a section inside the assembler.
   - Assembles sections with `[...].filter(Boolean).join('\n\n')` so an
     optional section (e.g. a persona's voice block, `''` for `general`)
     drops out cleanly instead of leaving a blank line or a conditional.
   - Factors any fragment reused by more than one variant into a helper
     (`coach-persona.ts`'s `voiceGuardrail()`, `BOARD_DISCIPLINE_REMINDER`)
     instead of copy-pasting it per variant.
   - Puts data-shaped/dynamic rendering (lists, tables) in `render.ts`-style
     pure functions, unit-tested directly with edge cases (empty list, etc.)
     — never built inline with string concatenation in the assembler.
   - Adds a full-text case to `coach-system.snapshot.test.ts` (or the
     equivalent for a new prompt builder) so an edit's actual blast radius
     shows up as a snapshot diff, not just the structural `.toContain`
     assertions. When two blocks reference each other in the prompt's own
     prose ("see 'X' above"), add the pair to `coach-system.refs.test.ts` —
     these can't be compiler-checked (the model reads the prose, not an ID),
     so a test asserting the referenced text still exists verbatim is the
     guardrail against a silent rename/reword breaking the reference.

## TypeScript rules

- `strict: true`, no `any` (use `unknown` + narrowing), no non-null `!` except in
  tests. No `enum` — use union types / `as const` arrays (they align with zod).
- Errors: services throw typed errors from `apps/api/src/lib/errors.ts`
  (`NotFoundError`, `ValidationError`, `InsufficientCreditsError`, ...); the
  Fastify error-mapper plugin converts them to problem+json. Never `catch` and
  swallow; never return `null` to signal an error.
- Async: no floating promises (`@typescript-eslint/no-floating-promises` is on).
- Naming: files `kebab-case.ts`; functions are verbs (`classifyMove`,
  `buildCoachSystemPrompt`); booleans read as predicates (`isAnalysisReady`);
  no abbreviations (`analysis`, not `anls`).

## Testing (TDD — non-negotiable)

- Write the failing test first, watch it fail, implement, watch it pass. Every
  plan task in `docs/plan.md` is structured this way — follow the steps.
- Vitest everywhere. Unit tests live next to the code (`foo.test.ts`).
- `packages/chess-analysis` and `packages/prompts`: pure unit tests, exhaustive
  edge cases (illegal PGN, mate scores, 0-move games).
- API integration tests: real Postgres via Testcontainers
  (`apps/api/test/helpers/db.ts` gives a migrated throwaway DB per suite). Mock
  the LLM gateway and engine HTTP — never call real providers in tests.
- Agent tests: mock model via AI SDK's `MockLanguageModel`; assert tool-call
  sequences and that tool wrappers enforce budgets.
- Run before claiming done: `npm run lint && npm run typecheck && npm test`.

## Git

- Small commits, one logical change each, after each plan task's test passes.
- Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
- Never commit secrets, `.env` files, or generated PGN test fixtures over 50 KB.

## Things you must never do

- Put SQL outside `db/repositories/`.
- Call an LLM provider SDK outside `llm/`.
- Show raw engine evaluations in coach-facing UI copy (the coach translates).
- Hardcode model ids, prices, depths, or budgets — they are env/config.
- Add a dependency without checking an existing one covers it.
- Edit stored `session_messages` (append-only; caching depends on it).
- Let the LLM's output touch the DB without zod validation + closed-enum checks.
