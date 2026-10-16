# FreeChessCoach — The content studio writes the course itself (Phases 130–132)

Written 2026-10-14. The plan before this one (the review audit, Phases
120–127, and the coach's progress memory, Phases 128–129) moved to
`docs/review-audit-plan.md` with its open tasks; it did not end. Phase
numbers continue from 129.

**Source specs.** `docs/courses.md` is long: never read it end to end, only
the section a task's **Read:** line names. The studio's own instructions are
`../chess-content-studio/CLAUDE.md` (a folder beside this repo, not in git).

## Why (the owner's report, 2026-10-14)

The Stafford Gambit course in production (`1ace4dfd-be15-4094-b0f0-c6b8b009f5a9`,
made 2026-10-13) teaches `6. Bg5 Bxf2+ 7. Kxf2 Nxe4+` and branches only
at move 8. The king's choice at move 7 (`Kxf2`, `Ke2`, `Kd2`) is the key
point of the lesson and has no variation. Checked on the stored row:

- The move tree is the PGN pasted at intake and never changes
  (`draftProblem` in `apps/api/src/services/courses/draft-checks.ts`). The
  pipeline adds no branch. Nothing was cut for time: all four lines of the
  PGN became chapters.
- The studio wrote that PGN and a direction ending "Only talk about the
  moves in the PGN". Its only chess tool, `tools/check_line.mjs`, evaluates
  a line it was given; it cannot ask "what else can White play here".
- The app's engine knew. The stored dossier has `checkAnswers` at `Bxf2+`
  (`Kxf2`; `Kd2`, `Ke2`), and `alternatives` at `Kxf2` (`Ke2`, `Kd2`: "Black
  is much better"). An alternative carries a verdict and no line, and
  nothing turns it into a branch or a warning. The tempting-move search
  (`temptingCandidates`, `packages/chess-analysis/src/course/tempting.ts`)
  looks only at checks, captures and threats, so a quiet king step is never
  a candidate.
- The dossier also rates `6... Bxf2+` a mistake (best: `6... Nxe4`), and
  gives `Be2` as White's best at move 6. Neither is a line of the PGN.

**What the owner asked for:**

1. The studio (Claude Code, a stronger model than the app's writer)
   researches the position with the engine, decides the tree, writes the
   whole course, video and reel text itself, and fills the course through
   the API. The app's AI generation becomes the fallback, not the way.
2. **It uses the app's own dossier and review code, never a copy.** That
   code is improved continuously (the review audit); every improvement must
   reach the studio the day it merges.
3. The long video and the course have no time pressure: they take every
   branch that matters. The reel takes one line.
4. A general kind, `lesson` (built 2026-10-16), for any topic from a few
   examples: a position the owner gives, how a piece moves, a pattern.

## What already exists and is reused as-is (verified in code, 2026-10-14)

- **A course with no AI call.** `POST /api/courses` builds the tree
  (`createCourse`, `course-drafts.ts`). `POST /api/courses/:id/skeleton`
  ("Build without AI", `buildSkeletonDraft`) runs the engine, builds the
  kind's skeleton and writes template episodes (`buildManualEpisodes`).
  `PUT /api/courses/:id/draft` saves a whole document; it refuses a changed
  tree, and node ids never change. `GET /api/courses/:id/publish-check`
  runs `verifyCourseEpisode` on every episode.
- **The dossier outside the API.** `buildCourseDossierFromEngine(tree,
  learnerSide, engine, kind)` (`apps/api/src/services/courses/dossier.ts`)
  with a `NativeEngineBackend(engineUrl)`; `apps/api/scripts/golden-inputs.ts`
  already calls it for a fixture. `renderCourseDossier`
  (`packages/chess-analysis/src/course/dossier-text.ts`) renders it.
- **What the app's writer is given.** `printCourseFacts`
  (`apps/api/scripts/course-golden-facts.ts`): the playbook
  (`buildCoursePlaybook`), the reel candidates, and each episode's facts
  (`buildCourseEpisodeMessages(...).user`).
- **A board calculator.** `probe()` (`apps/api/scripts/review-audit/probe.ts`):
  the board after some moves, attackers and defenders, legal moves, the
  engine's three lines.
- **The engine.** The dev stack's container, `http://localhost:8081`
  (`/analyze-position`, `/analyze-game`). Stockfish is not installed on the
  host; nothing in this plan installs it.
- **Dev auth.** With `AUTH_MODE=dev-stub` (the compose default) a request
  with no identity headers is `dev@local.test`
  (`apps/api/src/plugins/auth-headers.ts`). A script can call
  `http://localhost:3000` directly.
- **Six kinds:** `COURSE_KINDS` in `packages/shared/src/course.ts`.
  `endgame` (Phase 103) is the newest and the model for adding one.

## What is missing (verified in code, 2026-10-14)

- **G1. The dossier is stored only by AI generation.** `setDossier` has one
  caller, `loadGenerationInputs` (`generation-inputs.ts`). `buildSkeletonDraft`
  builds a dossier and throws it away, so a course filled by hand is checked
  with `dossier: null` (`draftCheckProblems`, `publish.ts`): no engine facts.
- **G2. The publish check is the episode check only.** `verifyCourseReel`,
  `verifyCourseFrame` and `overusedOpeners`
  (`packages/chess-analysis/src/course/verify-reel.ts`) run only inside
  generation (`generate-reel.ts`, `generation.ts`). A hand-written reel,
  hook or outro is not checked.
- **G3. No way to read a course's dossier.** `CourseResponse` has `evals`
  and no dossier.
- **G4. No research tool.** Nothing lists a position's replies with the
  engine's answer to each, and nothing compares a PGN with what the engine
  says a real opponent plays.
- **G5. No way to move a course from dev to production.** Production sits
  behind oauth2-proxy; a script has no identity there, the owner's browser
  tab has.

## How to work through this plan

- One task at a time; read only its **Read:** list.
- **One copy of each chess idea (AGENTS.md rules 10 and 11), and the
  owner's point 2.** Every studio tool calls the app's functions. Nothing
  re-implements a fact, a verdict word or a check, here or in the studio
  folder; that folder holds instructions and notes, no chess code.
- The tools are scripts in `apps/api/scripts/course-studio/` that call
  services and packages, never the other way round.
- The app never searches deeper than depth 12 (owner, 2026-10-02): the
  dossier keeps the app's engine settings. `explore` is a script and may ask
  for more (`--depth`, default 18 like `probe`).
- Tests: few (owner's rule). No real engine or model.
- **No backward compatibility.** Course rows are test data.
- The dev stack is up as a rule (owner, 2026-10-14); the tools use its
  engine and api containers and install nothing.
- After each task: `npm run verify:changed`, tick the boxes, add `Status:`,
  one conventional commit.

---

## Phase 130 — Research before the tree is fixed

Status: done 2026-10-14 — run on the production Stafford input against the
dev engine: `explore --replies` after `6... Bxf2+` lists `7.Kxf2`, `7.Ke2`,
`7.Kd2` with the engine's answers; `dossier` prints the writer's facts and
the gaps `7.Kd2`, `7.Ke2`, `8.Ke3`, `8.Kf3`, `8.Ke2` and `6.Be2`.
`gaps.test.ts` passes.

- [x] `npm run course:studio -w apps/api -- <command>`
      (`apps/api/scripts/course-studio/cli.ts`; its header lists the
      commands). Engine answers are cached in
      `apps/api/.course-studio-cache.json` (ignored by git).
- [x] `explore`: `probe()` (the review audit's, with `--lines`), and with
      `--replies` every move of the side to move (above 12: the checks, the
      captures and the engine's top lines) with `positionWords` and the
      engine's answer as a PGN variation (`explore.ts`).
- [x] `courseGaps(tree, dossier)`
      (`packages/chess-analysis/src/course/gaps.ts`): the opponent's moves
      the tree has no line for: every legal answer to a learner's check that
      the tree continues past, and the engine's `bestInstead` where the
      course's opponent makes a mistake or a blunder.
- [x] `dossier <intake.json>`: `printCourseFacts` for any intake (the
      playbook, the reel candidates, each episode's facts), then the gaps
      with the engine's verdict and answer (`dossier.ts`). The intake file
      is a `CreateCourseRequest`.

## Phase 131 — Fill a course through the API

Status: done 2026-10-14 — on dev: `create` (refused with gaps, made with
`--gaps-read`), the stored row has its dossier and diagnosis codes, `check`
reports problems that need the engine's facts ("Ke2 … is not in the
analysis"), `push`/`pull` round-trip, a changed tree is refused (400),
`export` writes a snippet that parses. `courses.db.test.ts` passes (7).
The snippet was not run against production.

- [x] G1: `buildSkeletonDraft` keeps the dossier it builds (`setDossier`)
      and sets the diagnosis codes with the first one
      (`course-drafts.ts`).
- [x] G2: `draftCheckProblems` (`publish.ts`) also runs `verifyCourseReel`
      and `verifyCourseFrame`; their problems carry the episode ids `reel`
      and `course`.
- [x] `create`, `pull`, `push`, `check`, `script` (`api.ts`): the app's
      routes with no headers (dev-stub). The draft file is
      `<slug>.course.json`, a `CourseDocument`.
- [x] `export <id> <intake.json>`: `<slug>.import.js`, one expression for
      the signed-in production tab: create from the same intake, `skeleton`
      (so production builds and keeps its own dossier), `PUT …/draft` with
      the text, then the publish check. No cookie or token is read; no
      import page was built (G5).
- [x] Dev engine: the compose service inherited `image: node:24-slim` and
      tagged its own build with it; a later pull of the base image left the
      container without Stockfish. It now has its own image name
      (`docker-compose.yml`).

- [x] Replace a course's tree (the studio's `appRequests` of 2026-10-13):
      `PUT /api/courses/:id/document` stores `{ pgn, direction, document,
      dossier }` as the studio sends them; the studio does the checks
      (docs/courses.md §10). No learner progress is reset: it is keyed by
      position.

Not built, on purpose: a route that returns the dossier (the `dossier`
command prints the same facts from the intake, with the same node ids), and
gaps in the studio page.

## Phase 132 — The studio's instructions

### Task 132.1 — Research, tree, facts, write, check, watch

Status: done 2026-10-14 — in `../chess-content-studio`:
`playbooks/authoring.md` (new), `tools/course.sh` (new: runs
`course:studio` from that folder), `CLAUDE.md` (the studio writes the course
itself; the app's AI is the fallback), the two agents use `explore`;
`tools/check_line.mjs` is gone. The replaced files are in
`handoff/2026-10-14/`. Not yet used on a real course.

### Task 132.2 — The Stafford Gambit again, as the first test

Status: done (owner, 2026-10-16).

---

## Left open

- **The app's own writer and gaps.** The AI path still writes only the
  PGN's moves. Feeding it the gaps is a prompt change to judge on the
  golden set.
- **Gaps in the studio page.** Worth it once the studio has used them on
  three courses and the list is short and right.
