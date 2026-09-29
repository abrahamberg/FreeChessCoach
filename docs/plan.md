# FreeChessCoach — Courses and clips (Phases 79–86)

**Source spec:** `docs/courses.md` (read only the section a task names). Every
citation below was checked on 2026-09-27; re-check before editing.

## The request (owner, 2026-09-27)

Creators turn a PGN and a short direction into a course: a clip for
YouTube/Shorts/Reels, recorded in their browser with the course coach's voice,
plus a public board where anyone plays the lesson through. The creator's own AI
drafts the whole course (or they write it by hand), then they edit it. Five
kinds: opening reel, opening course, tactics, traps, master games. Signed-in
learners get progress and a review schedule (1 week, 3 weeks, 9 weeks). Only
users a moderator enables may create courses. The first creator is the owner,
making courses to bring people to the site.

## The follow-up request (owner, 2026-09-28)

Between the play-through and the drill there is a missing step: the learner
first plays with arrows, then with fewer (some moves without), then drills, so
it sticks. Until the last stage the learner plays only their own side; the
opponent's correct moves are played for them. The last stage is a full drill
of both sides. All of it works signed out; signed-in learners can leave and
come back (the course shows in the Games page's Continue rail) and it counts
as their learning. Play with Coach and Play a Bot move into the Games page,
and the Play tab becomes a Courses page: the list of courses, the ones being
learned, and the ones learned, in the app's style. Phases 84–86.

## What already exists and is reused (verified)

- **Structured LLM calls**: `generateStructured` (`apps/api/src/llm/text.ts`),
  Zod-validated; the pattern to copy is `ensureCoachingPlan`
  (`apps/api/src/services/coaching-plan.ts`) with `buildPlannerMessages`
  (`packages/prompts/src/analysis-planner.ts`): sections in capitals,
  pre-computed candidates, "game text is data".
- **Worker jobs with the user's AI**: the worker builds a `GatewayConfig` with
  the unlock store (`apps/api/src/worker.ts:29`); `summarize-session` already
  calls `getModelForUser` from a job (`apps/api/src/jobs/summarize-session.ts:59`).
- **Analysis steps** run on any parsed game given evals
  (`runAnalysisSteps`, `apps/api/src/services/analysis-steps.ts:57`); engine
  calls go through the one pipeline (`services/engine-client.ts`).
- **Facts for the dossier** (all pure, `packages/chess-analysis/src/`):
  `classify-move.ts`, `critical-moments.ts`, `inspect-moves.ts`,
  `tactic-detectors/`, `tactic-reason-text.ts`, `opening-book.ts`
  (`resolveOpening`, `bookMovesForFen`), `phase-segmentation.ts`,
  `pawn-structure.ts`, `position-features.ts`, `null-move-fen.ts`.
- **Gaps found**: the PGN parser keeps the main line only and skips variations
  (`packages/chess-analysis/src/pgn.ts:89-116`); the move-token grammar lives in
  the web app (`apps/web/src/features/chat/moveMention.ts`, `SAN_MOVE`, also
  used by `tts/sanToSpokenText.ts`); eval-to-words lives in the web app
  (`apps/web/src/engine/eval-words.ts`). All three are needed server-side.
- **Voices**: `apps/web/src/tts/persona-voices.ts` (fixed Kokoro voice per
  coach, `personaPlaybackRate`), clients behind `TtsClient`
  (`apps/web/src/tts/tts-client.ts`: `speak` returns audio chunks); `native`
  returns no bytes (`native-speech.ts`).
- **Persona prompts**: `PERSONA_VOICE` (`packages/prompts/src/coach-persona.ts:82`)
  mixes the voice with chat-only rules; `general` is empty by design.
- **Errors**: `ForbiddenError` (`apps/api/src/lib/errors.ts:15`).
- **Latest migration**: `0011_chess_api_rate_limit.ts`.

## Design decisions (do not relitigate)

- **Creation is off by default**: `users.can_create_courses`, set by a script;
  checked on the server for every creator route (`docs/courses.md` §2).
- **Code decides the facts, the AI writes the words**; nodes by id only; one
  outline call and one call per episode; a code verifier after every episode
  with one repair call; leftover problems are editor warnings
  (`docs/courses.md` §5–§7).
- **Standard tier** for course generation; it runs as a worker job.
- **Clips are made in the browser and never uploaded.** All audio is made
  first, then the clip is recorded in one pass, 9:16 and 16:9. No `native`
  voice for courses. Course-note audio is uploaded on publish
  (`docs/courses.md` §8).
- **Publish as unlisted by default**; `removed` is the moderator's status.
- **Progress is keyed by position + move**, never by node id or episode.
- **Review steps**: 1 week, 3 weeks, 9 weeks, mastered; a miss restarts, due
  tomorrow.

## Layering

Pure logic (tree parsing, dossier assembly, skeleton, verifier, review
scheduling) in `packages/chess-analysis`. Schemas in `packages/shared/src/course.ts`.
All prompt text in `packages/prompts/src/course/`. SQL only in
`apps/api/src/db/repositories/courses.ts` (+ `course-audio.ts`,
`course-progress.ts`). LLM calls only through `apps/api/src/llm/`. The web app
gets a `features/courses/` folder (editor, clip recorder, public player).

## Phase 79 — Course foundation (creator only, no AI)

### Task 79.1 — Creator flag

**Read:** `apps/api/src/db/migrations/0011_chess_api_rate_limit.ts`,
`apps/api/src/db/repositories/users.ts`, `packages/shared/src/user.ts`,
`apps/api/src/routes/users.ts`.
**Files:** migration `0012_course_creators.ts`, those files, a new
`apps/api/scripts/course-creator.ts`.

Status: done 2026-09-27, commit c378ad8. verify:changed green except
`llm/endpoint-fetch.test.ts` "resolves to loopback", which times out when DNS
hangs on this machine (unrelated, untouched). The first cold API run times out
a few DB tests; re-run.
Guard lives in `apps/api/src/services/courses/require-course-creator.ts`;
the repo setter is `setCanCreateCourses(db, email, value)` (not in `UserPatch`).

- [x] Migration: `users.can_create_courses boolean NOT NULL DEFAULT false`.
- [x] Expose `canCreateCourses` on the current-user response (read-only; no
  route can set it).
- [x] `course-creator.ts grant|revoke <email>` sets the flag; prints the user
  and the new value; exits non-zero when the email is unknown.
- [x] A `requireCourseCreator(user)` guard throwing `ForbiddenError`, with a
  test.

Commit: `feat(courses): creator flag, set by script`

### Task 79.2 — PGN with variations

**Read:** `packages/chess-analysis/src/pgn.ts`, `pgn-move-comments.ts`.
**Files:** a new `packages/chess-analysis/src/course-tree.ts` + test;
`pgn.ts` untouched (game import keeps its main-line parser).

Status: done 2026-09-27, commit 76326f4. Decisions: pre-order visits the main
continuation first, so the main line is `n1…nK`; line ids are `l1…` in leaf
order and a node's `lineId` is the first line through it. A comment before the
first move of a variation (or the game) names that line. `[%csl]` squares are
arrows with `from === to`; colours G=best, R=threat, Y/B=idea. Errors carry
`pgnLine` (the PGN text line), `moveNumber`, `side`, `san`; an illegal move
skips the rest of its branch. A repeated variation reuses the node. Files:
`course-tree.ts`, `course-tree-build.ts`, `course-pgn-tokens.ts`,
`course-pgn-comment.ts`.

- [x] Failing tests: nested variations become a tree with ids `n1…` in
  pre-order; comments stay on their node; `[%cal]`/`[%csl]` become creator
  arrows; a `[FEN]` header sets the start; an illegal move reports its line
  and move number; ids are stable when the same PGN is parsed twice.
- [x] `parseCourseTree(pgn)` returns nodes, lines (root → leaf, named from the
  PGN or `Line A`, `B` …) and errors.

Commit: `feat(courses): parse a PGN with variations into a move tree`

### Task 79.3 — Course schema and storage

**Read:** `docs/courses.md` §4, §9; `packages/shared/src/coaching-plan.ts` for
schema style.
**Files:** `packages/shared/src/course.ts`, migration `0013_courses.ts`,
`apps/api/src/db/repositories/courses.ts`, tests.

Status: done 2026-09-27, commit 6696698. Deviations from the §4 sketch: nodes
also carry the creator's PGN `comment` and `arrows` (straight from
`parseCourseTree`); a draft allows 0–3 `takeaways`/`hookOptions`, so publish
(82.x) must require exactly 3 takeaways; `role` is a free string, legal roles
per kind are checked in code (80.x). Also exported: `COURSE_KINDS`,
`COURSE_STATUSES`, `CourseGenerationSchema` ({status, step, done, total,
error}). Repository `insert`/`updateDraft` validate and reject; `setStatus`
has no owner check (callers check); account deletion now deletes courses.
Open for the skeleton task: `parseCourseTree` reads only the first game, but
the `tactics` kind takes several games or positions (§3).

- [x] `CourseDocumentSchema` as in §4 (Zod; types by `z.infer`).
- [x] Table `courses`: `id`, `owner_id`, `slug` (unique), `kind`, `status`
  (`draft|unlisted|public|removed`), `title`, `source_pgn`, `direction`,
  `document` jsonb (draft), `published_document` jsonb, `published_at`,
  `generation` jsonb (job status, progress, error), timestamps.
- [x] Repository: create, get by id for owner, update draft (validated by
  the schema before write), list by owner, set status.

Commit: `feat(courses): course document schema and table`

### Task 79.4 — Server-side helpers moved out of the web app

Status: done 2026-09-27, commit a9fd116. `SAN_MOVE` (now exported too),
`MOVE_TOKEN`, `BARE_SAN` live in `chess-analysis/src/san-token.ts`;
`cpToWords`/`mateToWords` in `chess-analysis/src/eval-words.ts` (web copy
deleted). Both are in the barrel. New tests: `san-token.test.ts`,
`eval-words.test.ts`.

**Read:** `apps/web/src/features/chat/moveMention.ts`,
`apps/web/src/tts/sanToSpokenText.ts`, `apps/web/src/engine/eval-words.ts`.
**Files:** those, new homes in `packages/chess-analysis/src/`
(`san-token.ts`, `eval-words.ts`), tests.

- [x] Move `SAN_MOVE`/`MOVE_TOKEN`/`BARE_SAN` and `cpToWords`/`mateToWords`
  to `chess-analysis`; the web files import them. No behaviour change
  (existing tests stay green).

Commit: `refactor: share the move-token grammar and eval words`

### Task 79.5 — Dossier and skeleton

Status: done 2026-09-27, commit e493d70. Pure (chess-analysis):
`courseLineGames`/`courseTreeFens` (`course-line-game.ts`),
`buildCourseDossier` → `{learnerSide, nodes: CourseNodeFacts[], lines:
CourseLineFacts[]}` (`course-dossier*.ts`), `renderCourseDossier`
(`course-dossier-text.ts`), `buildCourseSkeleton({kind, tree, lines,
dossier})` (`course-skeleton.ts`, returns null for a trap line with no
victim move), `inferLearnerSide(kind, tree, resultHeader)` (null = ask).
`CONFIG.courses.onlyMoveGap = 20`. Service:
`buildCourseDossierFromEngine(tree, learnerSide, backend)` in
`apps/api/src/services/course-dossier.ts` — one `analyzeGame` batch
(multiPv 3) over distinct FENs, then `runAnalysisSteps` per line; the caller
passes the backend (use `resolveReviewEngineBackend`, Lichess index first).
Test fixtures (fake evals, `analyseCourse`) in
`chess-analysis/src/course-test-fixtures.ts`. Deviations: §5.4's
`positional-squares.ts` does not exist, so line end facts are
`computePositionFeatures` files/pawns plus wing majorities and king
placement; "tempting" moves outside the engine's top 3 are listed without a
verdict (no eval for them); a node's facts come from its own `lineId`;
`tactics` picks one example per *line* (the parser still reads one game).
Verdict wording is `eval-words.ts`'s ("The position is roughly equal"),
not §5.4's shorter examples.

**Read:** `docs/courses.md` §5.4, §5.5, §10; `apps/api/src/services/analysis-steps.ts:57-120`;
`packages/chess-analysis/src/critical-moments.ts`.
**Files:** `packages/chess-analysis/src/course-dossier.ts`,
`course-skeleton.ts`, `apps/api/src/services/course-dossier.ts` (engine
calls), tests.

- [x] Service: evaluate every tree position once (shared by FEN) through the
  engine pipeline, multiPv 3; run the analysis steps per line.
- [x] Pure: per-node facts (§5.4), including `quiz-eligible`
  (`CONFIG.courses.onlyMoveGap`, win-percentage gap) and `critical`; per-line
  end features. A renderer to text with verdict words only (test: no digit
  that looks like an eval appears).
- [x] Pure: skeleton per kind (§5.5). Tests on the Englund trap line
  (`docs/courses.md` §6.6): bait `n11`, answer `n12`, learner side Black.
- [x] Learner-side inference (§3).

Commit: `feat(courses): dossier and skeleton from the engine and chess-analysis`

### Task 79.6 — Editor (manual path)

Status: done 2026-09-28, commit ea588d4. Routes (`routes/courses.ts`, each
calls `requireCourseCreator`): `POST /api/courses` (intake →
`CreateCourseRequestSchema`, 201 + `CourseResponse`), `GET /api/courses`
(own list), `GET /api/courses/:id` (404 for non-owner or non-uuid),
`PUT /api/courses/:id/draft` (`{document}`, 204 like every PUT here),
`POST /api/courses/:id/skeleton` ("Build without AI", synchronous; 503 with
no engine). Schemas in `packages/shared/src/course-api.ts`. Service
`services/courses.ts`; the document is created at intake (nodes/lines,
empty episodes), title = first sentence of the direction, slug =
title + 6 hex. `draftProblem` (`services/courses/draft-checks.ts`) refuses
a changed tree/kind/line leaves and any id that doesn't exist — compare
field by field, jsonb reorders keys. At most `MAX_COURSE_NODES = 400`.
Manual episodes (`services/courses/manual-*.ts`) use §6.3's roles per kind
(trap: hook/setup/bait/quiz/punish/safety; reel: hook/line/idea/remember;
course: line/deviation/trap/recap; tactics: concept/example/scan; master:
intro/moves/moment), `focus` holds the role's prompt, beats are empty,
notes are `noteText(facts)` plus the creator's PGN arrows. The engine pass is
injected as `BuildAppOptions.courseDossierBuilder` (default
`courseDossierBuilderFor(engineBackendOptions)`). Web:
`features/courses/` (`/courses/new` intake + "Your courses" list,
`/courses/:id/edit` editor), "Create course" in `AccountMenuSections`.
Not done: Lichess study URL import (§5.3 — PGN paste only); the editor
was not tried in a browser (no dev stack running) — only typecheck and
unit tests. The skeleton call runs in the request; if long games time out,
move it to the 80.x worker job.

**Read:** `docs/courses.md` §3, §5.3, §10; `apps/web/src/features/board/CoachBoard.tsx`.
**Files:** routes `apps/api/src/routes/courses.ts`, service
`services/courses.ts`, `apps/web/src/features/courses/` (new), `App.tsx`.

- [x] Routes (all behind `requireCourseCreator`): create from intake, get,
  save draft, build skeleton.
- [x] Web: "Create course" in the account menu only when `canCreateCourses`.
  Intake form (§5.3). Editor: chapters and episodes on the left, board in the
  middle, the selected episode's beats/notes/quiz on the right; arrows drawn
  on the board with the existing tap-to-draw; "Build without AI" fills the
  skeleton with template text.

Commit: `feat(courses): course editor with a no-AI skeleton`

## Phase 80 — AI course generation

### Task 80.1 — Verifier

Status: done 2026-09-28, commit 10830a0.
Notes for the next task: `verifyCourseEpisode({episode, startFen, nodes,
dossier, direction?, budget?})` in `packages/chess-analysis/src/course-verify.ts`
(+ `-scope`, `-board`, `-text`) returns `{code, nodeId, message}[]`, codes
`nodes|moves|tactic-words|numbers|arrows|lengths|quiz|phrases`. Allowed
moves = lesson moves from the root to the episode's end (or the quiz answer)
plus `bestInstead`/its line, `alternatives` and `tempting` of nodes inside the
episode (path + quiz answer). A bare square ("on c3") is not a move unless it
has a move number. A tactic word passes when the same word family appears in
the inside nodes' motif noun, tactics, board facts, `after` or creator comment.
Arrows: a move for either side (null-move flip) before or after the node.
With `dossier: null` (hand-written, no engine pass) moves are checked for
legality only and tactic words/quiz eligibility are skipped — that is what
the editor runs live (`CourseEpisodeWarnings.tsx`); 80.4 should store the
dossier (or the warnings) so the editor can pass it. `budget` is optional:
80.3 computes it. Limits in `CONFIG.courses` (`maxArrowsPerBeat`,
`maxCaptionWords`, `maxNoteSentences`, `maxCriticalNoteSentences`).
`BANNED_GENERIC_PHRASES` is now a list in `packages/shared/src/banned-phrases.ts`;
`coach-persona.ts` builds its sentence from it (snapshots unchanged). Fixed in
the dossier (`course-dossier-words.ts`): a piece the move attacks that is
pinned to its king says so ("attacks the bishop on c3, which is pinned to the
king"); forks are only the moved piece's; "hanging" needs a legal capture.
`analyseEnglund()` is in `course-test-fixtures.ts`.

**Read:** `docs/courses.md` §7.
**Files:** `packages/chess-analysis/src/course-verify.ts` + test.

- [x] Failing tests, one per check in §7, using the Englund dossier: a note
  naming `Nd5` (not in the analysis) fails `moves`; "fork" at `n11` fails
  `tactic-words`; `+1.3` fails `numbers`; an arrow `a1-h8` fails `arrows`; a
  hint containing `Bb4` fails `quiz`; the §6.6 example passes.
- [x] Runs on hand-written episodes too (the editor shows its warnings).

Commit: `feat(courses): verify every move, tactic word and number in a script`

### Task 80.2 — Course voice blocks

Status: done 2026-09-28, commit 93847d4.
Notes for the next task: `PERSONA_WORDS` (`packages/prompts/src/persona-words.ts`)
holds name, identity and word bank for the six voiced personas;
`coach-persona.ts` interpolates them (checked byte-identical against a dump
of `PERSONA_VOICE` before the change; chat snapshots untouched).
`buildCourseVoiceBlock(persona)` (`packages/prompts/src/course/course-voice.ts`,
exported from the barrel) returns the 5-line §6.2 block; `general` and
`general_female` get "You are a calm, clear club coach." Clip examples have no
moves in them on purpose. Snapshots in `src/course/__snapshots__/`.

**Read:** `packages/prompts/src/coach-persona.ts`, `coaches.md`.
**Files:** `coach-persona.ts`, new `packages/prompts/src/course/course-voice.ts`,
snapshots.

- [x] Move each persona's word bank and identity line into data used by both
  the chat block and the new course block. Chat prompt snapshots unchanged
  (byte-identical).
- [x] `buildCourseVoiceBlock(persona)` per §6.2, with two clip example lines
  per persona; `general`/`general_female` get the neutral course voice.

Commit: `feat(prompts): course voice per coach, sharing the chat word banks`

### Task 80.3 — Prompts and schemas

Status: done 2026-09-28, commit 92b7912.
Notes for the next task: build a `CoursePromptContext`
(`packages/prompts/src/course/context.ts`: kind, persona, learnerSide,
levelBand, direction, startFen, nodes, lines, dossier, skeleton, headers
{white, black, event, year} — parse them from `courses.sourcePgn`), then
`buildCourseOutlineMessages(context)` and, per episode,
`buildCourseEpisodeMessages({context, outline, episodeId, creatorRequest?, retry?})`;
both return `{system, user}` with the same `system` (cache-stable, tested).
`retry` = `{previousOutput, problems}` for the §7 second attempt. Validate
answers with `CourseOutlineSchema` / `EpisodeScriptSchema` (shared
`course.ts`; nullable `answerNodeId`, `quiz`, `pauseMs` — map null to absent
when merging into the document). Budgets: `courseBudget(kind, persona)` and
`episodeWordBudget(budget, outline, episodeId)` (`course/budget.ts`); the
latter is the verifier's `budget`. Clip lengths, words per second (2, scaled
by `PERSONA_SPEECH_SPEED`, now in shared `constants.ts` and read by web
`persona-voices.ts`) and pause live in `CONFIG.courses`. The episode dossier
= its path + the node before + the quiz answer (`episodeDossier`). Test
fixtures: `course/fixtures.ts` (prompts) and the new
`@freechesscoach/chess-analysis/course-test-fixtures` subpath. The §6.4 outline
validation (ids exist, roles legal per kind, required nodes covered) is not
written yet — it belongs with the job in 80.4. `docs/prompts.md` §8 shows the
rendered trap prompts.

**Read:** `docs/courses.md` §6.
**Files:** `packages/prompts/src/course/` (`shared.ts`, `playbooks.ts`,
`outline.ts`, `episode.ts`), `packages/shared/src/course.ts`
(`CourseOutlineSchema`, `EpisodeScriptSchema`), tests.

- [x] `buildCourseOutlineMessages` and `buildCourseEpisodeMessages` with the
  text of §6.1–§6.5; budgets computed from the clip length and the persona's
  Kokoro speed (`CONFIG.courses.wordsPerSecond × speed`).
- [x] Tests: the system prompt is identical across episode calls of one
  course (cache-stable); each playbook fills every placeholder; the dossier
  for an episode contains only that episode's nodes plus the one before.
- [x] `npm run docs:prompts` so `docs/prompts.md` gets a course section.

Commit: `feat(prompts): course outline and episode prompts per kind`

### Task 80.4 — The generation job

Status: done 2026-09-28, commit 34bc3ec.
Notes for the next task: `runCourseGeneration(deps, courseId)`
(`apps/api/src/services/course-generate.ts`; deps = `{db, buildDossier,
resolveModel}`, built by `courseGenerateDepsFor` in `jobs/course-generate.ts`)
is the whole pipeline; the steps are `services/courses/generation-inputs.ts`
(context from the row; the dossier is stored in the new `courses.dossier`
column, migration 0014), `generate-outline.ts` (`planOutline`: check with
`checkCourseOutline` from chess-analysis `course-outline-check.ts`, one retry,
then the manual skeleton's episodes with the model's title/promise/hooks/
takeaways and an `outline` warning) and `generate-episode.ts` (`writeEpisode`:
call, `verifyCourseEpisode`, at most one repair). State lives in
`courses.generation` (`CourseGenerationSchema` now carries `outline`,
`finishedEpisodeIds`, `warnings`); `setGeneration` leaves `updatedAt` alone.
A `ValidationError` (expired unlock) marks the run failed and is not
rethrown; other errors are recorded and rethrown. The job is enqueued once
(`maxAttempts: 1`, jobKey per course). Routes: `POST /api/courses/:id/generate`
(202; body `{restart}`; a failed run with an outline resumes; 409 while
queued/running) and `POST /api/courses/:id/episodes/:episodeId/regenerate`
(`{instruction}`, runs in the request; model from `BuildAppOptions.courseModelResolver`,
default the gateway's standard tier). `COURSE_ROLES` is in shared `course.ts`
and the outline prompt names them. Web: `CourseGenerationBar` (Write with
AI / Resume, progress, course-level warnings; `useCourse` polls every 2 s
while running) and `CourseEpisodeAi` (stored warnings, Regenerate). The
outline fallback replaces the whole outline, not only the failing part.
The editor's live checks still run without the dossier (the dossier is not
sent to the web). Not tried against a real model or in a browser.
For 80.5: to run without a DB, call `loadGenerationInputs`-like code with an
in-memory row, then `planOutline` and `writeEpisode` with a `CourseModelCall`.

**Read:** `apps/api/src/services/coaching-plan.ts`, `apps/api/src/jobs/summarize-session.ts`,
`apps/api/src/jobs/queue.ts`.
**Files:** `apps/api/src/services/course-generate.ts`,
`apps/api/src/jobs/course-generate.ts`, routes, tests with the mock model
(`apps/api/test/helpers/mock-model.ts`).

- [x] Pipeline of §5.2: dossier → skeleton → outline (validate, one retry
  with the listed problems, then skeleton fallback for the failing part) →
  one call per episode → verifier → one repair call per failing episode →
  save the draft with warnings. Progress written to `courses.generation`.
- [x] Finished episodes are saved as they complete; a resumed job skips them.
- [x] Route: start generation; regenerate one episode with a creator
  instruction (§6.5).
- [x] Tests: invalid outline is retried once with the problems in the prompt;
  a verifier failure triggers exactly one repair; an expired unlock stops the
  job with the unlock error and keeps finished episodes.

Commit: `feat(courses): generate a course draft with the creator's AI`

### Task 80.5 — Quality harness

Status: done 2026-09-28, commits 6a30b51 (harness) … c4c0f8d (last tuning);
findings below. Tuned on gpt-6-luna, then on gemma-4-12b until all five kinds
ran with 0 warnings and no false chess claims. The tuning rule that came out
of it: the app supplies every chess fact (dossier, code's plan), the model
only words them; a wrong claim means a missing fact, not a prompt warning.
Notes: `apps/api/scripts/course-golden.ts` (`npm run course:golden -w apps/api`)
runs `draftFromIntake` → engine dossier (`NativeEngineBackend`, default
`http://localhost:8081`) → `generationInputs` → `planOutline` → `writeEpisode`
per episode, all in memory, and prints each course with
`course-golden-print.ts` (beats, notes, quiz, ✓/✗ verifier, calls split into
outline/episodes/repairs). Model: `--email` + `UNLOCK_PHRASE` decrypts the
owner's saved setup (read only), or `GOLDEN_PROTOCOL`/`GOLDEN_MODEL`/
`GOLDEN_API_KEY`[/`GOLDEN_ENDPOINT`]; `resolutionForSetup` (gateway.ts) builds
the standard-tier model like the app. Local models are refused (they need the
browser tunnel). Fixtures: `apps/api/test/fixtures/courses/*.json` (trap =
Englund §6.6, opening_reel = Italian, opening_course = London with an early
...c5 sideline, tactics = Legal's and Scholar's mate, master_game = Opera
Game), loaded by `golden-set.ts`; `golden-set.test.ts` checks each parses,
its learner side, and < 5 KB. Not yet run against a real model or engine
here (no engine on :8081 and no network in this session).

First run findings (2026-09-28, trap = Englund, in the app end to end:
worker job, browser LLM tunnel, LM Studio `google/gemma-4-12b-qat`; outline
≈2 min, whole course ≈10 min, 8 calls):
- **Dossier had no quiz-eligible node.** The Lichess eval index stores one
  line for most forced positions (6...Bb4, 7...Bxc3, 8.Qxc3 all 1 line), so
  `isQuizEligible` never saw a second line; the AI outline's quiz failed
  §6.4 twice and the skeleton fallback put the quiz on n12 anyway. Fixed:
  `EngineBackendAnalyzeOptions.minLines` — an index hit with fewer lines than
  that (and than the legal moves) is searched instead; the course dossier
  passes `minLines: 2`, game review is unchanged. After: n12/n14/n16
  quiz-eligible, 8 of 17 positions searched, outline passed first try.
- **Hook copied the playbook's example** "Their queen is gone in eight moves."
  word for word on a trap that mates. Fixed: the trap playbook states the
  ending (`trapEnding`: "checkmate, n16 (8... Qc1#). Promise the mate, not
  material.") and shows no example hook (courses.md §6.3 updated).
- **A quiz on an episode the outline gave none** (bait e3 carried e4's quiz)
  passed: the verifier never sees the outline. Fixed: `writeEpisode` checks
  the quiz against the outline's `answerNodeId` before the verifier.
- **"skews the queen"** on 7...Bxc3 passed: the skewer pattern needed
  "skewer". Fixed: `\bskew(?:er)?…`.
- Not fixed, prompt-level: an invented plan ("stops White's plan to win
  material through a fork"), highlights drawn with kind "best" (c3-c3),
  terse quiz reveal ("Bb4"). Good: the safety episode found 6.Nc3 from the
  dossier, the 6...Bb4 pin was stated correctly.
- App, found on the way: intake level showed raw band values and two
  identical "Coach" options (now "New to chess"… and "Coach (male/female
  voice)"); disabled secondary/ghost/destructive buttons looked enabled
  (base.css now dims every disabled button); an api/worker restart
  mid-job (tsx watch) fails the run with a bare "fetch failed".
- Rerun with the fixes (same model): hooks now promise the mate; the two
  remaining warnings are real (arrow b4-f4). Still wrong and not caught: the
  outline's hook episode spans n1–n16 so e1 writes a note on all 16 moves;
  "Qb4+ pins the bishop on f4"; "fork" on n8; highlight arrows (x-x) used
  as "best". Next: tune on a strong model (owner's gpt-6-luna, run the
  golden set inside the worker container — WSL has no DNS), then back to
  gemma to see what a weak model still misses.
- gpt-6-luna, all five kinds (golden script inside the worker container,
  `--email dev@local.test --engine-url http://engine:8081`): 7–10 s per call,
  trap 106 s in total. Trap: correct mate hooks, the 6...Bb4 pin and the Nc3
  safety move; 2 arrow warnings left (b4-b2 is blocked). tactics and
  master_game: clean. opening_reel: the outline failed twice (narrates n9
  outside a one-node episode; 11 narrated nodes, budget 10) → skeleton.
  opening_course: outline failed twice (episode e9 leaves line l1 at n16) →
  skeleton; one 3-sentence note.
- **Dossier said "pinned" for a checking piece's target** ("Qb4+ attacks the
  bishop on f4, which is pinned to the king"; the same on 8...Qc1#): with the
  king already in check, removing any piece still leaves the check. Both
  models repeated it. Fixed in `course-dossier-words.ts`.
- Both models give the hook episode the whole line (n1–n16) and so write a
  note on every move, duplicating the setup episode's notes. To fix in the
  outline check / playbook.
- Seen in the debug log (gpt-6-luna, app run): 7 of 13 calls were repairs.
  Two were our false alarms, now fixed: arrows after a check (b4-f4 after
  Qb4+; the flipped position is illegal, so `course-verify-board.ts` also
  accepts an arrow along an attack), and the hook, which the playbook tells
  to promise the ending (8...Qc1#) while the verifier only allowed facts
  from its own move (`EpisodeScope.claims` adds the main line to the end for
  a hook). Still to tune: notes on the move before the episode (n10), the
  hook spanning the whole line, the trap's safety episode not on the bait.
- **Outline plan** (da53778): the outline prompt lists the §10 episodes
  (code's plan, the same the fallback uses) as spans to keep, the hook with
  `narratedNodeIds []`; the model writes the focus and picks narrated moves.
  Fixes the hook spanning the line and the safety episode off the bait.
  **Own nodes** (78a13c5): the episode prompt names the nodes its beats
  and notes may use; the move before is context only. Englund on gpt-6-luna
  in the app: before, 13 calls / 7 repairs / fallback outline; after the
  plan, 9 / 2 (notes on n10); after own nodes, 7 calls, 0 repairs, 0
  warnings. Script facts correct (pin on d2 after 7...Bxc3, 6.Nc3 safety on
  the bait). Weak: setup notes are filler ("Keep the move order intact"),
  since every node must get one. Not yet re-run: opening_reel and
  opening_course on the plan (the golden script needs the owner's unlock
  phrase), and gemma.
- **gemma-4-12b on the plan** (app, browser tunnel): 7 calls, 0 repairs,
  ~1.6 min (was ~10 min with outline failures). Checks passed, but the script
  was wrong where the dossier was silent: empty beats per setup move, a bare
  "6... Bb4" reveal, "Qb4+ forces the king to move", "Nc3 protects/blocks
  the rook", "4.Bf4 attacks the queen", "removes the piece preventing mate",
  "neutralizes the knight fork" (from a review "you stopped them…"
  sentence). **Principle (owner): the app supplies every chess fact; the
  model only words them.** Fixes: code drops empty beats (32251f6), the
  schema says what hint/reveal hold and the verifier refuses a bare reveal
  (541cdd1); the dossier states how a check can be answered, why the better
  move is better and how it keeps a piece safe ("the queen on d1 now defends
  it"), what every move does ("moves the bishop from c1 to f4"), back-rank
  mates, a lost guard ("the queen stops guarding c1, where Qc1# follows"),
  forks by piece, and drops prevention sentences (049d080, 8512935). After:
  8 calls, 1 repair (3 arrows), 0 warnings, no false chess claims; loose
  wording left ("vacate the first rank" for the lost guard).
- **gemma-4-12b, all five kinds in the app** (courses made from the golden
  fixtures through `/api/courses`, the browser tunnel; no unlock phrase
  needed). First pass: opening_reel and opening_course outlines passed first
  try (both fell back on gpt-6-luna before the plan); four episodes grew
  quizzes the outline never planned; the master game's intro stretched over
  all 33 moves, so every note was written twice (the plan was asked for, not
  checked); "trapped" false alarms on mated kings. Fixed (58e73de): the
  outline check holds the model to the plan (spans, roles, quiz answers);
  the plan drops a skeleton quiz answer that isn't eligible (shared
  `isQuizAnswerEligible`); the episode prompt says "Quiz: none"; "trapped"
  passes where the facts say mate. Rerun: trap 8 calls/1 repair, opening_reel
  6/1, opening_course 4/0, tactics 5/0, master_game 7/1 (the outline repair
  that restored the plan); 0 warnings in all five. Left, all "why" facts the
  dossier lacks: tactics "Nd5# saving your knight on e5", a hint about "the
  pawn guarding f7"; the tactics playbook's concept/scan episodes come out
  generic, and Legal's mate starts at Bxf7+ (the queen sacrifice 5.Nxe5 is
  not an example node); the opening reel's hook repeats the line's first beat.
- Last round (c4c0f8d): a mate now says why ("the bishop on f7 is guarded by
  the knight on e5"; gemma had written "Nd5# saves your knight on e5"), and
  a tactics example starts one learner move before the opponent's mistake
  (Legal's mate from 5.Nxe5 Bxd1??). Tactics rerun: 6 calls, 1 repair (the
  plan check), 0 warnings, reasons true. Left for later: vague phrasing
  ("deeper into your reach"), the opening reel's hook repeating its first
  beat, generic concept/scan episodes.
- A killed worker left the course "running" for good. Fixed (2ff1a3f): the
  job beats every 30 s; with no beat for 3 minutes it reads as failed and
  "Resume writing" carries on.
- Harness: prints each call's duration on stderr; with a local model use
  `GOLDEN_PROTOCOL=openai-chat GOLDEN_ENDPOINT=http://<windows-host>:1234/v1
  LLM_ALLOW_PRIVATE_ENDPOINTS=1`. docker-compose passes
  `LLM_ALLOW_PRIVATE_ENDPOINTS` through (default 0).

**Read:** `docs/courses.md` §7 (last paragraph).
**Files:** `apps/api/scripts/course-golden.ts`, `apps/api/test/fixtures/courses/`
(one small PGN + direction per kind, each under 5 KB).

- [x] Runs the pipeline against the owner's configured model without writing
  to the database; prints each episode, the verifier result and the call
  count. Record the first run's findings in this task, then tune the prompts
  on it.

Commit: `chore(courses): golden set for judging course prompts`

### Task 80.6 — Debug the course's AI calls

Status: done 2026-09-28, commit 195e664.
Notes: owner request — reuse the chat's "Debug last answer", and put it in the
menu. Each call is stored (`course_ai_calls`, migration 0015; repo
`course-ai-calls.ts`, capped at 80 per course, cleared by a fresh run) as the
chat's `TurnDebugSnapshot` (system prompt in `instructions`, the request as
the user message, the JSON answer as the assistant message, usage,
finishReason, providerMetadata) plus step / episode / repair / duration /
error and the checks' `problems`. `CourseModelCall` now takes a
`CourseCallLabel` and has `checked(label, problems)`, which `planOutline` and
`writeEpisode` call after each check; `loggedCourseCall`
(`services/courses/debug-log.ts`) is the job's and the regenerate route's
call. `GET /api/courses/:id/debug` (owner only). Web: `DebugPanelContent`
takes `title`/`context`/`children`; `CourseDebugPanel` is that panel plus a
call picker and the checks; "Debug last answer" is in the avatar menu via
`components/PageMenu.tsx` (`usePageMenuItems`, rendered by UserMenu with
BoardMenu's item button). `generateStructured` also returns finishReason and
providerMetadata.

**Read:** `apps/web/src/features/chat/DebugPanel*.tsx`,
`apps/api/src/services/coach-agent-debug.ts`.

- [x] Every model call of a run (outline, each episode, each repair, a
  regenerated episode) is logged on the course as the chat's debug snapshot,
  with which call it was and the problems our checks then found. A new run
  starts a fresh log.
- [x] `GET /api/courses/:id/debug` returns the log to the owner (404 for
  anyone else).
- [x] "Debug last answer" in the avatar menu opens the chat's debug panel on
  the newest call, with a strip to pick any call and its check results.

Commit: `feat(courses): show the creator every AI call of a course run`

## Phase 81 — Voice and clips (browser)

### Task 81.1 — Audio preparation

**Read:** `docs/courses.md` §8; `apps/web/src/tts/tts-client.ts`,
`resolve-tts-client.ts`, `persona-voices.ts`.
**Files:** `apps/web/src/features/courses/clip/prepare-audio.ts`, tests.

Status: done 2026-09-28 (commit below). The cache key is the exact text
(IndexedDB takes long keys), not a hash; identical texts are synthesised once;
the UI that calls it comes with 81.2's Preview clip.

- [x] Synthesise every beat and note with the course persona via the chosen
  backend (browser Kokoro, local Kokoro, OpenAI; `native` refused with a
  message). Later (2026-09-28, owner): Kokoro only, OpenAI removed from
  courses so every course sounds alike; the server takes WAV only. Progress callback. Cache by text + persona + backend in
  IndexedDB (wrapped in try/catch, works without it).
- [x] Nothing is returned until every sentence exists.

Commit: `feat(courses): prepare all coach audio before recording`

### Task 81.2 — Clip renderer and recorder

**Read:** `docs/courses.md` §8; `apps/web/src/features/board/EvalBar.tsx`,
`MoveQualityBadge.tsx`.
**Files:** `apps/web/src/features/courses/clip/` (`timeline.ts`,
`draw-frame.ts`, `record-clip.ts`), tests for `timeline.ts`.

Status: done 2026-09-28 for desktop Chrome, commit 08c992e. **Safari
parked indefinitely by the owner** (2026-09-28): no agent picks it up; the
owner reopens it if it is ever needed. Chrome records
`video/mp4;codecs=avc1,mp4a`: the trap's 16:9 clip came out 1920×1080, 46.2 s,
3.4 MB, video and audio decoding; the owner recorded one in Chrome too and
the MP4 plays (2026-09-28). Not drawn yet: the eval bar (the editor's
course has no evals; the dossier does). Also built: a voice picker in the
preview (a creator whose chat voice is the device voice gets the browser
voice, not a refusal), and code-built quiz moments (docs/courses.md §8).

- [x] Pure timeline: beats → start/end times from audio durations, gaps and
  quiz pauses (tested).
- [x] Canvas drawing for 1080×1920 and 1920×1080: board, arrows, captions,
  coach avatar, end card with the course link.
- [x] **Preview clip** in the editor: plays the timeline live on the canvas
  with the audio, in either format, with play/pause and a scrubber, no
  recording. Recording is the same playback captured, so the preview is
  exactly the file.
- [ ] Record canvas + Web Audio (persona playback rate applied) with
  `MediaRecorder`; MP4 where the browser supports it, else WebM with a note.
  Test on iPhone Safari and desktop Chrome before building further; record
  the result in this task.

Commit: `feat(courses): record reel and YouTube clips in the browser`

## Phase 82 — Publishing and the public course page

### Task 82.1 — Publish and audio upload

**Read:** `docs/courses.md` §8, §9.
**Files:** migration `0017_course_audio.ts`, `repositories/course-audio.ts`,
routes, `services/courses.ts`.

Status: done 2026-09-28 (commit below). Tried on the gemma trap in the app:
unlisted, 18 notes voiced with the local Kokoro server and uploaded as 24 kHz
mono WAVs (4.3 MB). Differences from the box: audio is keyed by the note
text's hash alone (identical texts share a file; the node adds nothing);
the coach's playback rate is baked into the file; the editor had no way to
write the takeaways, so the Publish dialog asks for them. Also fixed: the
error mapper turned Fastify's own 4xx errors (body too large, unsupported
type, malformed JSON) into 500s.

- [x] Publish copies the draft to `published_document`, status `unlisted`
  unless the creator picks `public`; blocked while verifier warnings are
  unticked.
- [x] Upload course-note audio (type and size checked; cap per course in
  `CONFIG.courses`), keyed by node id + text hash.
- [x] Creator pastes clip links (YouTube/Shorts/Instagram/TikTok URLs,
  validated by host).

Commit: `feat(courses): publish courses with their note audio`

### Task 82.2 — Public page

**Read:** `docs/marketing-demo.md` ("Public routes"), `docs/threat-model.md`.
**Files:** `docker/nginx.web.conf`, `deploy/helm/freechesscoach/values.yaml`,
`values.example.yaml`, `deploy/helm/test.sh`, `routes/public-courses.ts`,
`apps/web/src/features/courses/player/`.

Status: done 2026-09-28 (commit below). Tried on the published gemma trap
in a browser: the page loads outside the app shell; the quiz waits with Next
disabled; a wrong 6...a6 came back "miss: leaves the queen on b2
undefended" from the lite engine in the browser; Show the answer reveals;
the note audio is served (a 7.6 s WAV that decodes). Preview as learner
played the draft with the cached local voice. Differences from the box: the
audio endpoint is `/audio/:hash` (audio is keyed by text hash, 82.1); nginx
needs no entry (`/learn/*` goes through the SPA fallback, like `/demo`); no
creator name is shown (it defaults to the email's local part); new slugs get
48 random bits (unlisted links must not be guessable); the clip is a
thumbnail until played, then a `credentialless` frame (the app runs under
COEP). Not yet heard: sound in a visible tab (automation runs hidden, and
Chrome loads no media there). Owner to listen once.

- [x] `/learn/:slug` and the two read-only endpoints public (all three
  places); rate-limited; `removed` and `draft` return 404.
- [x] Player: embedded YouTube clip when linked; board play-through with
  arrows and note audio; quizzes wait for a move; wrong moves answered with
  the move-quality label and the checked tactic sentence; engine-equal
  alternatives accepted (§11).
- [x] **Preview as learner** in the editor: the same player component on the
  current draft (the player takes a `CourseDocument`, not a slug), note audio
  from the browser cache (81.1) instead of uploaded files; no publish needed.
- [x] Threat-model entry for the new public endpoints (T13).
- [x] Owner, 2026-09-28: learner audio served from Cloudflare's edge. Files
  are named by their bytes' hash (migration 0018) and cached a year,
  `immutable`. Still to do by hand in Cloudflare: the Cache Rule for
  `/api/public/courses/*.wav`, and a purge whenever a course is removed
  (docs/courses.md §9).
- [x] Owner, 2026-09-28: sync the audio to R2 (mirror of Postgres, custom
  domain). Publishing copies new files and deletes unused ones; the page
  uses the bucket once a file is there, the api otherwise;
  `scripts/course-remove.ts` takes a course down. Signer tested against
  AWS's published SigV4 example; not yet run against real R2 (the owner's
  bucket, token and domain come first; MinIO couldn't be pulled here to
  stand in). Owner to do: bucket, custom domain, token, Secret,
  `courseAudioMirror` values, then publish once and check the bucket.

Commit: `feat(courses): public course page, no login`

## Phase 83 — Learning progress and review

### Task 83.1 — Drills and review schedule

**Read:** `docs/courses.md` §11.
**Files:** `packages/chess-analysis/src/course-review.ts` + test, migration
`0020_course_progress.ts` (0015 was taken), `repositories/course-progress.ts`,
`routes/course-progress.ts`, `player/CourseDrill.tsx`,
`player/course-progress.ts`, `games/CourseReviewCard.tsx`.

- [x] Pure schedule: correct → next step (1 w, 3 w, 9 w, mastered); miss →
  step 0, due tomorrow (tests).
- [x] Progress keyed by normalised FEN + UCI; drill modes per kind.
- [x] Anonymous progress in the browser; moved to the account on sign-in.
- [x] "Due today" card on the Games page.

Notes: days are the learner's own calendar day (`YYYY-MM-DD` from the
browser), so "due tomorrow" and "Due today" follow their clock. The server
moves the schedule on from the stored step; the browser sends only right or
wrong, and only the first try at each move in a drill counts. A move the
engine rates about as good as the course's counts as right. On /learn the
page asks `/api/users/me` with `Accept: application/json` to tell whether the
visitor is signed in (oauth2-proxy answers 401 to that when not); the Games
page and a signed-in /learn import the browser's progress, newer copy wins.
The editor's "Preview as learner" drills too but saves nothing.

Commit: `feat(courses): drills and spaced review`

### Task 83.2 — Your own coach on a course

**Read:** `apps/api/src/services/coach-agent-system-prompt.ts`.
**Files:** the course player's "Ask my coach" panel and a course context
block for the coach prompt.

- [x] The learner's own persona answers, with the course line and notes in
  its context; distinct avatar from the course coach; engine wins over the
  course when they disagree.

Notes: `POST /api/course-questions` (signed in, the learner's own AI setup),
streamed like the other coach chats; nothing is stored, the browser sends the
short conversation each time and it restarts when the position changes. The
server builds the position from the published copy
(`services/courses/ask-coach.ts`); the prompt is
`packages/prompts/src/course/ask-coach.ts`: the course line as a scoresheet,
the move just played and the course's next move with their notes (the next
move also as checked facts), the episode's other notes, and the engine's
summary of the position, with the rule that the engine wins. Tools:
`check_moves` (defaults to the course position) and `get_engine_analysis`
when the learner has an engine. The panel sits under the course coach's card
in the play-through, in its own box with the learner's coach avatar and name;
hidden while a quiz asks (the coach knows the answer) and in the drill;
signed-out visitors get the same button, whose box says coaching needs
sign-in and signs in back to the course (`/oauth2/start?rd=…`); the editor's
preview shows neither.

Commit: `feat(courses): ask your own coach about a course move`

### Task 83.3 — Docs

Moved to Task 86.4, so the docs describe Phases 84–86 too.

## Phase 84 — The learning ladder

Design decisions (owner, 2026-09-28; do not relitigate):

- **Four stages per course, in order**: Play through (all arrows) → Practice
  (the learner plays, arrows fade) → Drill (own side, no arrows) → Full drill
  (both sides, no arrows). The stage is per course; the review schedule stays
  per position + move (`course-review.ts`).
- **Only the learner's own moves are asked until the full drill**; the
  opponent's course moves are played for them, for every kind, trap included
  (today a trap's drill asks both sides: `COURSE_DRILL_MODE.trap` in
  `packages/chess-analysis/src/course-review.ts`).
- **Only Drill and Full drill feed the review schedule** (first try counts, as
  now). Practice never does.
- **Everything works signed out**, kept in the browser; signing in moves it to
  the account (the pattern of `importBrowserProgress`,
  `apps/web/src/features/courses/player/course-progress.ts`).

### Task 84.1 — Stages and hints as pure code

**Read:** `docs/courses.md` §11;
`packages/chess-analysis/src/course-review.ts` (`buildCourseDrill`,
`COURSE_DRILL_MODE`) and its test.
**Files:** a new `packages/chess-analysis/src/course-stages.ts` + test;
`course-review.ts` (+ test).

Status: done 2026-09-28. Practice is `course-stages.ts`: a move's state is
`arrow` → `some_arrow` → `no_arrow` → `cleared` (known; no longer asked), one
step per right answer, and a miss goes back to `arrow`. In `some_arrow` every
other move of the line keeps its arrow, so the arrows thin out over rounds
(owner, 2026-09-28: round 2 had lost them all at once). `buildCourseDrill`
returns `sides`; `COURSE_DRILL_MODE.trap` is now `learner_side`.

- [x] Failing tests first: `COURSE_STAGES = ['play_through', 'practice',
  'drill', 'full_drill']` and `nextCourseStage`.
- [x] `buildCourseDrill(document, states, today, sides)` with `sides:
  'learner' | 'both'` replacing the per-kind `both_sides` mode. `learner`:
  the drill moves of the side that plays them (the learner's side; for
  tactics, the side to move at each example's drill move). `both`: every move
  of the drill episodes. Keep `guess_move` scoring for master games.
- [x] Practice hints, pure: `practiceShowsArrow(key, practice)`. A move shows
  its arrow until the learner has played it right without the arrow; a miss
  turns it back on. The stage is done when every asked move has been played
  right once without its arrow. The arrow is the move itself (from → to, kind
  `best`): the note's and the creator's arrows explain the position after the
  move, not the move.
- [x] Tests for each: the first ask shows the arrow, a right answer hides it
  next time, a miss shows it again, and when the stage is done.

Commit: `feat(courses): the four learning stages and fading hints`

### Task 84.2 — Practice and the stage bar in the player

**Read:** `apps/web/src/features/courses/player/CoursePlayer.tsx`,
`CourseDrill.tsx`, `CoursePlayer.css`; `apps/web/src/features/games/
CourseReviewCard.tsx` (its `?drill=1` link).
**Files:** those files, a new `player/CourseStageBar.tsx` + test,
`CourseDrill.test.tsx`.

Status: done 2026-09-28. Practice runs in rounds: each round asks the moves
not yet known, with the arrow on the ones not yet played right; a round's
summary says how many are known and offers "Next round" until all are, then
"Now without arrows". Which stages are finished is kept for the visit only
until Task 85.2 saves it. The play-through's end button is now "Practice".
A move log (`player/MoveLog.tsx`, owner 2026-09-28) is the coach's card
while the learner plays, newest on top: the move to play now with "Show the
move" beside it, the reply with the course's note, and their previous move
(✓ or "shown"), each with a pawn in its side's colour. Nothing else repeats them.
In practice the move to find shows what it does (the course's note) in place
of "your move"; while the move is hidden, its name is blanked out of the note
(`withoutMove`, `player/course-steps.ts`). "Show the move" is offered only
once the arrow has gone (the arrow already shows it). The log runs on across episodes
(one sequence; a new episode does not clear it), and practice shows no
"Line 1 of 3" counter. Practice counts rounds instead: "Round 2 of 3" while
playing (three rounds when every answer is right; a miss adds rounds), and
each round's summary has "Round 1 of 3 done", a progress bar that grows
every round, the moves missed, and how many arrows the next round has
(`practiceRoundsLeft`, `practiceProgress` in `course-stages.ts`). The current move is named in practice only while its arrow shows,
and hidden (`?`) otherwise and in the drills.

- [x] Failing tests first (mock `CoachBoard` as `CourseDrill.test.tsx`
  does): practice shows the arrow on the first ask, not after a right answer,
  again after a miss; the opponent's moves are played automatically in
  practice and drill; the full drill asks both sides; practice records
  nothing to the review schedule.
- [x] `CourseStageBar` replaces the "Play through / Drill" chips: four steps,
  finished ones ticked, the next one highlighted; any stage can be opened.
  Token colours only, every button styled (dark mode).
- [x] `CourseDrill` takes a `stage` prop (`practice | drill | full_drill`).
  Finishing a stage offers the next ("Now without arrows", "Now both sides").
- [x] `?stage=<stage>` opens a stage; `?drill=1` stays as an alias. The Due
  today card links with `?stage=drill`.
- [x] Manual check on `/learn/<slug>`: all four stages on the Englund trap.

Commit: `feat(courses): practice with fading arrows, then drill, then both sides`

## Phase 85 — My learning: keep the place, continue later

### Task 85.1 — Enrollment storage

**Read:** `apps/api/src/db/migrations/0020_course_progress.ts`,
`apps/api/src/db/repositories/course-progress.ts`,
`apps/api/src/routes/course-progress.ts`, `apps/api/src/services/account.ts`.
Status: done 2026-09-28. The stage list moved to `packages/shared`
(`COURSE_STAGES`, `CourseStageSchema`), re-exported by chess-analysis.

**Files:** migration `0021_course_enrollments.ts` (+ `migrate.ts`,
`schema.ts`), `repositories/course-enrollments.ts`, routes in
`routes/course-progress.ts`, schemas in `packages/shared/src/course-api.ts`,
`services/account.ts`, `player/course-progress.ts`.

- [x] Failing route tests first.
- [x] Table `course_enrollments (user_id → users ON DELETE CASCADE, course_id
  → courses ON DELETE CASCADE, stage text, place jsonb {episode, step},
  stages_done text[], started_at, updated_at, completed_at null, PRIMARY KEY
  (user_id, course_id))`. `place` is the play-through's episode and step and,
  in practice, which moves are known (drill key → state); a drill restarts at
  its beginning, as it is short and its order follows the review. `completed_at` is set when the full drill is
  finished.
- [x] `PUT /api/course-enrollments/:slug` (stage, place, stagesDone; 204),
  `GET /api/course-enrollments` (newest activity first, with title, kind,
  stage, stages done, place, completed), `DELETE
  /api/course-enrollments/:slug` ("remove from my learning"). The slug is
  resolved to a published course on the server; a taken-down course drops
  out of the list.
- [x] Signed out: the same record in `localStorage`, moved to the account by
  the sign-in import (the newer copy wins), next to the review progress.
- [x] Account deletion deletes the rows (test).

Commit: `feat(courses): keep each learner's stage and place in a course`

### Task 85.2 — Resume in the player

**Read:** `player/CoursePlayer.tsx`, `player/useCourseProgressStore.ts`.
**Files:** those, a new `player/useCourseEnrollment.ts` + test.

Status: done 2026-09-28. Without `?stage=` the saved stage opens; with it,
that stage opens with the stages finished before. The notice reads "Welcome
back: you were on Drill" (with the episode and move in the play-through) and
has "Start over". Nothing is saved until the learner does something. The
tests are in `CoursePlayer.test.tsx`.

- [x] Failing test first: a saved stage and place open the player there, with
  "Continue where you left off: Drill, move 5 of 15" and "Start over".
- [x] Saves the place as the learner moves (debounced, about 1 s) and on each
  finished stage; the editor's preview saves nothing.

Commit: `feat(courses): pick a course up where you left it`

### Task 85.3 — Courses in the Continue rail

**Read:** `apps/web/src/features/games/GamesPage.tsx` (the Continue section),
`ContinueSessionCard.tsx`, `RailCard.css`, `useGamesQueries.ts`
(`useInProgressGames`).
**Files:** a new `games/CourseContinueCard.tsx` + test, `GamesPage.tsx`.

Status: done 2026-09-28. `CourseContinueCard` shows "Stage 3 of 4: Drill",
the last day played and a bar of stages done; its play button opens
`/learn/:slug`, which resumes the saved place. `continueItems.ts` mixes and
orders the rail; `useCourseEnrollments` moves browser progress first.

- [x] Failing test first.
- [x] Unfinished courses join the Continue rail as rail cards: a "Course"
  chip, the title, the stage and a progress bar, a play button to the course
  at its saved place. Mixed with the game sessions by last activity; the
  count includes them.

Commit: `feat(games): unfinished courses in the Continue rail`

## Phase 86 — Courses in the navigation

### Task 86.1 — Play moves into the Games page

**Read:** `apps/web/src/features/play/PlayPage.tsx` (its doc comment records
the earlier choice to split playing from studying; the owner reversed it on
2026-09-28), `apps/web/src/features/games/GamesPage.tsx`,
`ImportShortcuts.tsx`, `apps/web/src/components/AppShell.tsx`
(`NAV_DESTINATIONS`), `apps/web/src/components/Icon.tsx`.
**Files:** those files; `App.tsx`.

Status: done 2026-09-28. Play and Import games share one compact card,
`games/StartShortcuts.tsx` (the owner found two cards too tall); the nav's Courses icon is `BookIcon`. Until 86.3, `/courses` is still
the creator's list, so a learner without the creator flag sees its error there.

- [x] A "Play" section on the Games page under Import games: Play with Coach
  (the learner's coach avatar) and Play a Bot, the same two destinations as
  `PlayPage`'s `DESTINATIONS`, in the Import games card style.
- [x] Navigation becomes Games, Courses, Progress, Stats, in both the top
  pill nav and the bottom tab bar; a Courses icon in `Icon.tsx`'s stroke
  style. `/play` redirects to `/games`; `/play/new` and `/play-bot/new` are
  unchanged; `PlayPage` and its CSS go.
- [x] The `/demo` runtime still works (`getDemoRuntime()` routes).

Commit: `feat(nav): play from the Games page, Courses in the navigation`

### Task 86.2 — Course catalogue API

**Read:** `apps/api/src/routes/public-courses.ts`,
`apps/api/src/plugins/route-rate-limit.ts` (`publicCourse`),
`apps/api/src/db/repositories/courses.ts` (`findPublishedBySlug`).
**Files:** those, `packages/shared/src/course-api.ts`, tests.

Status: done 2026-09-28. `coursesRepo.listPublic` reads the published copy's
fields in SQL; `courseCatalogue` pages with an opaque cursor (the row's
`published_at` text to the microsecond and its id). `?limit=` (1–50) is
there for tests and a short rail. The move count is the course's nodes.

- [x] Failing tests first: unlisted, draft and removed courses never appear.
- [x] `GET /api/public/courses?kind=` lists `public` courses only: slug,
  title, promise, kind, level, coach, learner side, published date, episode
  and move counts. Newest first, 50 a page with a cursor; cached 60 s.

Commit: `feat(courses): the public course catalogue`

### Task 86.3 — The Courses page

**Read:** `apps/web/src/features/games/GamesPage.tsx` and `GamesPage.css` (the
style to hold: section headings, `HorizontalScroller` rails, `rail-card`),
`apps/web/src/features/courses/CoursesPage.tsx` (today the creator's list at
`/courses`), `apps/web/src/components/AccountMenuSections.tsx` ("Your
courses"), `App.tsx`.
**Files:** a new `features/courses/learn/CoursesHomePage.tsx` + test and CSS;
`App.tsx`; `AccountMenuSections.tsx`.

Status: done 2026-09-28. `learn/CoursesHomePage.tsx`: Learning reuses
`CourseContinueCard` (now with a remove button), Browse is a grid with kind
pills and a Learning/Learned badge, Learned shows moves due from the review
query. `player/PublishedCourse.tsx` is the fetch-and-play part shared by
`/learn/:slug` and the new `learn/CoursePage.tsx`. The Continue and Due today
cards link to `/courses/:slug`. Not yet seen in the browser.

- [x] Failing test first: the three sections render from mocked queries,
  with their empty states.
- [x] `/courses` becomes the learner's page: **Learning** (unfinished: stage,
  progress, last activity), **Browse** (the catalogue, kind filter chips; a
  badge on courses already learning or learned), **Learned** (finished, with
  moves due for review).
- [x] The creator's pages move to `/studio`, `/studio/new`,
  `/studio/:id/edit`, with redirects from the old creator paths; the account
  menu item becomes "Course studio" (still creators only).
- [x] `/courses/:slug` shows the same `CoursePlayer` inside the app shell for
  signed-in users; `/learn/:slug` stays the public page. The Courses page and
  the Continue rail link to `/courses/:slug`.
- [x] "Remove from my learning" on a Learning card.

Commit: `feat(courses): a Courses page for learning, browsing and learned courses`

### Task 86.4 — Docs

Status: done 2026-09-28, after Phase 87 so the docs describe the final
layout (architecture.md "Courses", courses.md §9 and §11).

- [x] `docs/architecture.md`: courses (tables, job, public routes, clips,
  review, enrollments, catalogue, navigation).
- [x] `docs/courses.md` §11 (the four stages), §9 (the catalogue).
- [x] Update the AGENTS.md plan pointer.

Commit: `docs: courses, learning and the Courses page`

## Phase 87 — The course player on the app's board layout

The owner, 2026-09-28: the player "seems something of its own" and looks bad
on a phone. It should use the board layout every other board page uses,
Game Review's above all (`features/review/GameReviewPage.tsx`): on a desktop
an explorer column, the board column (eval bar, board, graph) and a coach
column; on a phone the coach note, the board edge to edge, the move strip,
and a bottom bar. The course's own features (stages, episodes, quiz,
practice arrows, move log, Remember, Ask my coach) are fitted into those
areas, not added beside them.

Decisions:
- `/courses/:slug` becomes a board route: no app top bar, its own header
  (`SessionHeader`'s style: back to Courses, the title, the stage).
  `/learn/:slug` gets the same layout without the app shell.
- The explorer lists the current episode's line from move 1, so the move
  numbers are right; moves before the episode starts are dimmed. In the
  drills it lists only the moves played so far (the move log's rows), never
  the ones still to find.
- The stages sit in the header as one compact control; the episodes sit at
  the top of the explorer column (desktop) or as a chip row above the note
  (phone).
- Evaluations come from the course's engine pass (`courses.dossier`), read
  when the public course is served. All course data is test data (owner,
  2026-09-28), so there is no compatibility for older dossiers; a course
  with no dossier shows no eval bar or graph, never a made-up 0.0.
- The board widgets need only `ply`, `evalAfterCp` and `quality` from a move;
  their props narrow to that instead of the whole `ClassifiedMoveDto`, so a
  course can feed them without faking a game analysis.

### Task 87.1 — Per-move evaluations in the published course

**Read:** `apps/api/src/services/course-dossier.ts` (`evalsByFen`),
`packages/chess-analysis/src/course-dossier-node.ts` (`CourseNodeFacts`),
`apps/api/src/services/courses/publish.ts`,
`apps/api/src/services/courses/public-course.ts`,
`packages/shared/src/course-api.ts` (`PublicCourseResponseSchema`).
**Files:** those; tests.

Status: done 2026-09-28. `apps/api/scripts/course-dossier-refresh.ts`
rebuilds dossiers with the engine alone (no AI); the dev courses were run
through it.

- [x] Failing tests first: a published course's response carries
  `evals: {nodeId: {cp, quality}}` (White's view, mate clamped like
  `classify.ts`) for its nodes; a course with no dossier returns `{}`.
- [x] `CourseNodeFacts` gains a required `evalAfterCp`.

Commit: `feat(courses): the public course carries its evaluations`

### Task 87.2 — Course moves for the board widgets

Status: done 2026-09-28. A move needs only nine fields (`ply`, `moveSan`,
`mover`, `isUserMove`, `cpLoss`, `quality`, `bestLineSan`, `evalAfterCp`,
`hangsPiece`); the rest are optional. So `player/course-move-list.ts` builds
real `ClassifiedMoveDto`s from the course's evaluations (no loss figure, no
tactics) and the widgets were not narrowed after all.

- [x] `courseMoveList(document, moves, evals)`: the line from the course's
  start (an episode's lead-in first), positions, rated moves.
- [x] MoveExplorer, MoveStrip and MoveNavStrip take `start`
  (`board/moveListStart.ts`: a course may start mid-game, Black to move)
  and `dimmedThroughPly` (the lead-in, faded).

Commit: `feat(board): move lists from any start, courses' moves for the widgets`

### Task 87.3 — The layout

**Read:** `features/review/GameReviewPage.tsx` + `.css`,
`GameReviewBoardColumn.tsx`, `features/session/SessionHeader.tsx`,
`components/AppShell.tsx` (`BOARD_ROUTE_PREFIXES`), `styles/board-bottom-bar.css`,
`features/courses/player/CoursePlayer.tsx`.
**Files:** a new `player/CourseBoardLayout.tsx` + CSS + test,
`CoursePlayer.tsx`, `CoursePane.tsx`, `AppShell.tsx`.

- [x] Failing test first: at desktop width the three columns render (the
  explorer, the board, the coach); at phone width the note, the board, the
  strip and the bottom bar, in that order.
- [x] Header: back (to Courses in the app, to the site on `/learn`), title,
  the stage control. `/courses/` is a board route.
- [x] Play through in it: the explorer column (episodes, then the line), the
  board column (eval bar and graph when evals exist), the coach column
  (`CoursePane`: note, quiz, Ask my coach). Phone: note card on top, the
  strip under the board, the bottom bar holds Previous / the next step
  ("Bait ›", "Practice ›").
- [x] Remember covers the board columns on desktop and is a full-screen
  sheet on a phone.

Status: done 2026-09-28, looked at in the browser at 1920×1009 and 375×667.
`player/CourseHeader.tsx` (the stage bar on a desktop, a picker on a phone;
Start over in the "⋮" menu), `player/CourseBoardLayout.tsx` (Game Review's
classes), `player/PlayThrough.tsx` (moved out of `CoursePlayer.tsx`). The
move list and graph grow as the learner goes, so a quiz answer never shows
early. On a phone "Ask my coach" is a pill beside the voice toggle and opens
as a sheet; the clip is a "Watch the clip" chip that opens a dialog.

Commit: `feat(courses): the course player on the app's board layout`

### Task 87.4 — Practice and drills in the same layout

**Read:** `player/CourseDrill.tsx`, `MoveLog.tsx`.
**Files:** those, their tests.

- [x] The move log becomes the explorer column's list (desktop) and the
  strip (phone); the masked current move stays masked.
- [x] The coach column holds the prompt, the feedback and Show the move;
  the round and progress go in the bottom bar on a phone.

Status: done 2026-09-28. The move log stays in the coach column (the
owner asked for it as the coach's message); the explorer column holds the
round's status and the current line's moves so far (`MoveExplorer`'s new
`hideNav`), the phone a strip and the status in the bottom bar. The
summaries sit centred where the board was. On a phone the course reserves
21rem around the board (Game Review 27.5rem), so the board is near full
width; the move to play comes first in the pane.

Commit: `feat(courses): practice and drills in the board layout`

### Task 87.5 — Phone pass

- [x] In the browser at 390×844 and 360×740: nothing scrolls sideways; the
  board is full width; every control is at least 44 px; the Remember sheet
  and Ask my coach open over the board and close back to the same move.
- [x] The same at 1280×800 and 1920×1080; dark mode on both.

Status: done 2026-09-28, in Chrome frames at 390×844, 375×667 and 360×740
and at 1280×760 (dark) and 1920×1009: no sideways scroll; the episode
chips, the stage picker and the note's replay button got 44px targets; the
move log's row wraps instead of squeezing. The in-app `/courses/:slug` was
not opened (the browser's tab was held by the owner's session); it is the
same component as `/learn/:slug` inside the board-route shell.

Commit: `fix(courses): phone layout pass`

## Phase 88 — Board sounds

The owner, 2026-09-28: a few clear board sounds, on every board and in
courses, and under the moves of clips. They must never talk over the
coach's voice; on the live board they fill the wait for the coach.

The five sounds: **move** (the learner's), **opponent** (the same kind of
knock, lower and softer), **check**, **bad** (a mistake or blunder) and
**great** (a great or brilliant move, or one that turns the game).

Decisions:
- Generated from a measured pattern: the owner found the first synthesized
  set and then Kenney's CC0 recordings unnatural (2026-09-28), and picked
  two reference sounds (a move and a capture). Their audio is not used:
  `scripts/sounds/generate-board-sounds.py` holds only a coarse profile of
  each (loudness every 2.5 ms, third-octave band levels early, mid and late)
  and builds new sounds from fresh random resonances and noise following it,
  shifted a few percent. The owner's choices: check is the capture's
  pattern made sharper over a heavier knock (it dominates); bad is the
  move's knock with its ring choked; great sits between a capture and a
  move. Six sounds: a capture has its own (`x` in the SAN).
  The files are in `apps/web/public/sounds/`. Each sound is mixed once from its
  layers into an `AudioBuffer`, so the board and clips play the same thing.
  `/sounds/` is a skip-auth route (the public course page plays them).
  Settings > Board has a button per sound to hear them.
- One pure function picks a move's one sound:
  `moveSound({ san, mover, learnerSide, quality, cpBefore, cpAfter })` →
  `check` (`+`/`#`), else for an analyzed move `bad` or `great`, else
  `capture`, else `move` or `opponent`. (Bad and great were first a second
  sound 120 ms after the knock; once they became versions of the knock
  itself, each move plays one.)
  "Turns the game": the mover's expected points (the classifier's
  win-probability) go from below 0.4 to above 0.6. The owner, 2026-09-28:
  **live games** (with the coach, with a bot) have no bad or great sounds;
  **analyzed moves** (review, a course play-through, clips) play them for
  both sides. In practice and drills a wrong try plays bad (it is the
  course's judgement of the learner's try, not a live game's move).
- Never over the voice: voice players (`useCoachVoice`, `useNoteAudio`, the
  native speech queue) report speaking to a small shared signal; a board
  sound during speech plays at a third of its volume. A course note whose
  move makes a sound starts its voice 250 ms after the move sound. In a
  clip the timeline gives every narrated move a 250 ms lead before its
  audio, so the sound and the voice never overlap.
- A setting: Settings > Board, "Move sounds" on/off (default on), per
  device like the legal-move dots. Clips: a "Board sounds" switch in the
  clip panel (default on); the recording uses what the preview plays.

### Task 88.1 — The sound kit

**Read:** `apps/web/src/hooks/useShowLegalMoveDots.ts`,
`features/settings/SettingsPage.tsx` (the Board section),
`packages/chess-analysis/src/classify.ts` (expected points).
**Files:** new `apps/web/src/sounds/board-sounds.ts` (synthesis, a shared
`AudioContext`, `playBoardSounds`), `sounds/move-sounds.ts` + test (the pure
picker), `sounds/voice-activity.ts` (the speaking signal), a
`useMoveSounds` setting hook; Settings.

- [x] Failing tests first: the picker (learner move, opponent move, check
  beats move, mistake/blunder → bad, great/brilliant or a turned game →
  great, for either side; no quality given, as in a live game → no stinger).
- [x] The five sounds, each under 400 ms (great under 700 ms), normalized so
  none is louder than the others; ducked while the voice speaks.
- [x] Settings > Board: Move sounds on/off.

Status: done 2026-09-28. `apps/web/src/sounds/`: `move-sounds.ts` (the
picker), `board-sounds.ts` (synthesis; each sound normalized, then set to
its own level: in Chrome the average levels sit at 0.08–0.09 and the
opponent's knock at 0.066; lengths 180/180/380/400/680 ms),
`voice-activity.ts`, `move-sounds-setting.ts`. Not yet listened to by the
owner.

Commit: `feat(sounds): board sounds and when to play them`

### Task 88.2 — Sounds on the board

**Read:** `features/session/SessionBoardColumn.tsx`, `usePlayMoveSubmit.ts`,
`usePlayBotMoveSubmit.ts`, `useLivePositions.ts`,
`features/review/useGameReviewPageData.ts`, `hooks/useCoachVoice.ts`,
`features/puzzle-session/` (practice).
**Files:** those.

- [x] Live games: the learner's move sounds on drop, the coach's or bot's
  reply when it lands, check; no bad/great (the owner's call).
- [x] Review: stepping forward one move plays that move's sounds, bad/great
  for either side; jumps do not.
- [x] `useCoachVoice` and the native queue report speaking.

Status: done 2026-09-28. One hook, `sounds/useMoveStepSounds.ts`: a step
forward of one move sounds it (practice: up to two, in turn, from the
position's side to move); the student's drop sounds at once
(`soundOwnMove`) and not again when it lands. Coaching on an analyzed game
passes its ratings; coach and bot games pass none. `useCoachVoice` and
`useNoteAudio` report speaking through `sounds/voice-activity.ts`.

Commit: `feat(sounds): sounds on the live board and in review`

### Task 88.3 — Sounds in courses

**Read:** `features/courses/player/PlayThrough.tsx`, `CourseDrill.tsx`,
`useNoteAudio.ts`.
**Files:** those, their tests.

- [x] Play through: stepping forward plays the move's sounds (both sides'
  stingers, from the course's evaluations); a solved quiz plays great; the
  note's voice starts 250 ms after.
- [x] Practice and drills: the learner's move, the auto-played opponent,
  check; a wrong try plays bad; `useNoteAudio` reports speaking.

Status: done 2026-09-28. `courseMoveSounds` (`player/course-move-list.ts`)
reads the course's evaluations; the note's voice waits the length of the
move's sounds (`boardSoundsLengthMs`), not a fixed 250 ms, so a great
sparkle never runs under it. A quiz try knocks on drop, then plays great
(accepted) or bad; a solved quiz's move plays great.

Commit: `feat(sounds): sounds in courses`

### Task 88.4 — Sounds in clips

**Read:** `features/courses/clip/timeline.ts`, `clip-player.ts`,
`record-clip.ts`, `ClipPreview.tsx`.
**Files:** those, `timeline.test.ts`.

- [x] Failing test first: each `move`/`beat` segment with a move carries its
  sound cue; a narrated beat's audio starts `soundLeadMs` (250) after the
  segment starts, and its length grows by the same.
- [x] `ClipPlayer` schedules the sound buffers on the same clock into the
  same output, so the preview and the recording match; the "Board sounds"
  switch turns them off.

Status: done 2026-09-28. Segments carry `sound` and `audioOffsetMs`; a
narrated move's voice waits the length of its sounds (not a fixed 250 ms).
The editor's `CourseResponse` gained `evals` (shared `courseEvals` with the
public course) for the clip's bad and great. Not yet heard or recorded in
the browser (the editor is in the app, whose tab was held by the owner's
session).

Commit: `feat(sounds): board sounds under clip moves`

### Task 88.5 — Docs

- [x] `docs/architecture.md` (Web: board sounds), `docs/courses.md` §8 (clip
  sounds) and §11.

Commit: `docs: board sounds`

## Phase 89 — A Course studio in the app's style

The owner, 2026-09-28: "Course studio looks very primitive". Seen in the
browser: `/studio` is a bare list of underlined links; `/studio/new` a
column of plain fields and native selects; the editor has the title and
promise as two inputs in a row of five identical outlined buttons, "Write
with AI" on a line of its own, and one long scrolling form on the right.
All three should look like the rest of the app (cards, sections, the
Courses page and the board views) and share one header pattern.

### Task 89.1 — The studio list's data

**Read:** `apps/api/src/services/courses.ts` (`listCourses`),
`apps/api/src/db/repositories/courses.ts` (`listByOwner`),
`packages/shared/src/course-api.ts` (`CourseSummarySchema`).
**Files:** those; `routes/courses.test.ts`.

- [x] Failing test first: each summary carries `promise`, `episodes`,
  `moves` (from the draft) and `generation` (`status`, `done`, `total`, or
  null).

Commit: `feat(courses): the studio list shows each course's size and state`

### Task 89.2 — The studio page

**Read:** `features/courses/CoursesPage.tsx`,
`features/courses/learn/CoursesHomePage.tsx` + CSS (the card grid and filter
pills to reuse), `features/games/RailCard.css`.
**Files:** `CoursesPage.tsx` (the studio) + CSS + test.

- [x] Failing test first: cards with the kind chip, a status badge (Draft,
  Unlisted, Public, Removed), title, promise, "12 moves · 6 episodes · edited
  Sep 28", a progress bar while the AI writes; Edit, and Open (the public
  page) once published; filter pills All / Drafts / Published; an empty state
  that says how a course is made (paste a PGN, the AI writes, preview,
  publish) with New course.

Commit: `feat(courses): the Course studio page`

### Task 89.3 — New course

**Read:** `features/courses/CourseIntakePage.tsx`,
`features/settings/BandSelect.tsx`, `CoachPersonaSelect.tsx`,
`features/board/MiniBoard.tsx`, `courseKinds.ts`.
**Files:** those; `CourseIntakePage.css` + test.

- [x] Failing test first: kinds as cards (icon, name, one line); the PGN
  box beside a small board of the line's end with "16 moves, 1 line, you
  teach Black"; level with `BandSelect`, the coach with
  `CoachPersonaSelect`, the learner side as a three-way switch (From the
  PGN, White, Black); the direction with the kind's example as a "Use this
  example" chip; Create draft at the end. One column on a phone.

Commit: `feat(courses): a guided new-course page`

### Task 89.4 — The editor's frame

**Read:** `features/courses/CourseEditorPage.tsx`, `CourseEpisodePanel.tsx`,
`CourseEpisodeAi.tsx`, `CourseGenerationBar.tsx`, `CourseOutline.tsx`,
`player/CourseHeader.tsx`.
**Files:** those + CSS + tests.

- [x] A studio header: back to the studio, the title (edited in place),
  the status badge, the save state ("Saved" / "Unsaved changes"), Save,
  Preview (a menu: clip, as learner), Publish; "Build without AI" in "⋮".
- [x] The promise and "Write with AI" move into a Details card at the top
  of the outline column.
- [x] The right panel in tabs: Notes (focus, the move's note, arrows),
  Quiz, Clip, AI (the episode's writer), instead of one long form.
- [x] The columns in the board views' style (the explorer and notes column
  chrome); a creator tool, so desktop first, but nothing breaks on a
  phone (the columns stack).

Commit: `feat(courses): the course editor's frame`

### Task 89.5 — Browser pass and docs

- [x] All three pages at 1920 wide, in Chrome. Not checked at 1280 and 390
  wide or in dark mode: the app's tab session blocks frames and a second
  window; the styles use the app's tokens and the phone rules stack them.
- [x] `docs/courses.md` §5.3 (the new-course page) and §9 (the studio).

Commit: `docs: the Course studio`

## Phase 90 — Long and short, move by move; a curriculum order

The owner, 2026-09-28, on the editor: "Write with AI" and "Build without
AI" both replace everything, so they are one reset; the clip's "beats" are
not understood; the course coach is not shown; and courses need sorting by
level with a curriculum order ("1200-01, 1200-02") so learners can follow a
path.

The model today: an episode has **notes** (text per move, the course page)
and **beats** (the clip's script: which moves it stops on, what is said,
the caption). They are the same idea twice. Phase 90 makes them one:

- Each move of an episode is a **ply** entry: `{ nodeId, text, clipText?,
  caption?, arrows, long, short }`. `long`: it speaks in the course (the
  play-through); `short`: in the clip. The clip speaks `clipText` when
  there is one, else `text`; the caption is made from the spoken line
  unless set. A move with neither is just played. Most moves are not
  voiced, least of all in the short.
- An episode may open with a card (`opener: { say, caption }`), the hook's
  title card today; the end card stays code's.
- **Budgets**, set by the planning call: each episode gets how many moves
  may speak in the long and in the short, and the clip a total length (a
  reel about 45 s, a YouTube video a few minutes); the episode call picks
  the moves within them. The creator changes any of it by ticking
  "In the course" / "In the clip" while stepping through the moves.
- The pipeline stays (docs/courses.md §5.2): the engine pass, the outline
  call (the structure from the kind's template and the direction, now with
  budgets), one episode call each (the course coach's voice, very
  important, and text worth hearing), every sentence grounded in the
  engine's facts for its move, then the verifier.
- **Level and order**: a course gets a target rating and a place in that
  level's curriculum (`level: { rating: 1200, order: 1 }`, shown
  "1200-01"). The rating replaces the band picker (the band the prompts use
  is derived from it: under 1000 new to chess, under 1500 improving, under
  1900 club, then advanced). The Courses page and the studio sort by it:
  Curriculum (level, then order) or Newest.
- All course data is test data (owner, 2026-09-28): the schema changes
  without migrating old documents; `scripts/sounds`-style tools rebuild what
  is needed.

### Task 90.1 — The ply model

**Read:** `packages/shared/src/course.ts` (`CourseEpisodeSchema`),
`packages/chess-analysis/src/course-verify*.ts`, `course-skeleton.ts`,
`apps/api/src/services/courses/manual-episodes*.ts`, `note-audio.ts`,
`apps/web/src/features/courses/player/course-steps.ts`,
`clip/timeline.ts`, `clip/prepare-audio.ts`.
**Files:** those and their tests.

- [x] Failing tests first: the player speaks a ply's `text` when `long`;
  the clip timeline narrates `short` plies with `clipText ?? text` and an
  automatic caption; a ply with neither is played silently; the opener is
  the title card.
- [x] `notes` and `beats` are replaced by `plies` and `opener`; the
  verifier, the manual skeleton, note audio (one file per spoken text) and
  publish follow.

Status: done 2026-09-28. `CoursePly`, `CourseOpener`, `CourseBudget`,
`CourseLevel` and the helpers (`clipLine`, `clipCaption`, `levelCode`,
`bandForRating`, `defaultCourseBudget`) are in `packages/shared/src/course.ts`.
The verifier counts each version's budget; the no-AI template ticks a
move or two for the clip where there is a tactic or a critical moment; note
audio is the course's lines only (the clip voices its lines in the browser).
The editor's panel moved to plies here too (the rest of 90.3 follows). The
demo courses were dropped from the dev database.

Commit: `feat(courses): one ply list for the long course and the short clip`

### Task 90.2 — Budgets and the episode call

**Read:** `packages/prompts/src/course/` (outline, episode, voice),
`apps/api/src/services/courses/generate-*.ts`, `docs/courses.md` §6.
**Files:** those, their snapshot tests, the golden set.

- [x] The outline call returns each episode's budget (`long`, `short`
  voiced moves) and the clip's target seconds, from the kind's template.
- [x] The episode call returns plies with `long`/`short`, `text`, and
  `clipText` only when the clip needs a shorter line; within its budget.
- [x] The voice block leads the episode prompt, with the persona's example
  lines and two rules: every line sounds like this coach, and every line
  says something the learner would want to hear (no filler like "a solid
  move"). Each ply's facts come from the dossier.
- [ ] `npm run course:golden` on the six golden courses: every episode within
  budget, the verifier clean or its warnings shown.

Status: code done 2026-09-28. The voice block now opens the system prompt;
the shared block's "two texts" became "each move, two versions" and "every
line earns its place" (no filler, every line in the coach's voice). The
golden run is the owner's: it needs their unlock phrase (`UNLOCK_PHRASE=… npm
run course:golden -w apps/api -- --email <owner>`), and it spends their
credits.

Commit: `feat(courses): budgets from the plan, plies from the episode call`

### Task 90.3 — The editor, move by move

**Read:** `CourseEditorPage.tsx`, `CourseEpisodePanel.tsx`,
`CourseBoardPanel.tsx`, `CourseBeatsEditor.tsx`, `CourseStudioHeader.tsx`.
**Files:** those + tests.

- [x] The Moves tab (was Notes): for the selected move, two ticks (In the
  course, In the clip), the text, "A different line for the clip" (shows
  `clipText`), the caption override, the arrows. The move chips under the
  board mark which moves speak in the course and in the clip.
- [x] The Clip tab becomes the short's script: the opener and each clip
  move in order with its line, and the clip's estimated length against its
  budget. `CourseBeatsEditor` goes.
- [x] One "Start over…" in "⋮": a dialog with Write it again with AI, or
  Start from the template (no AI). "Write with AI" shows only on an empty
  course; an episode is rewritten from its AI tab.
- [x] The Details card shows the course coach (portrait and name, change
  it: the voice changes, and a hint to rewrite for the new personality) and
  the level (rating and order, "1200-01").

Status: done 2026-09-28, checked in the browser on a template-built
Englund trap at 1200. The intake asks for the learner's rating (pills,
800–2200) instead of the band; the server derives the band and gives the
course the next place at that level (`coursesRepo.countAtLevel`).
`CourseDetails.tsx` (coach, level, promise), `StartOverDialog.tsx`; the
move chips mark course and clip moves.

Commit: `feat(courses): edit each move for the course and the clip`

### Task 90.4 — Sorting by level and order

**Read:** `apps/api/src/routes/public-courses.ts` and
`services/courses/public-course.ts` (the catalogue),
`features/courses/learn/CoursesHomePage.tsx`, `CoursesPage.tsx`.
**Files:** those + tests.

- [x] The catalogue items carry the level; `?sort=curriculum|newest`
  (curriculum: rating, then order, then newest).
- [x] Browse and the studio: a Sort control (Curriculum, Newest); in
  Curriculum order each card shows "1200-01", and the rows fall under level
  headings (1000, 1200, …).

Status: done 2026-09-28. Curriculum order pages by position (an offset
cursor), since level and place give no stable key to page after; newest
keeps its date cursor. Browse opens in Curriculum order, the studio in
Newest (sorted on the page). `learn/course-sort.tsx` has the order, the level
groups and the Sort control.

Commit: `feat(courses): sort courses by level and curriculum order`

### Task 90.5 — Docs

- [x] `docs/courses.md` §4 (the document), §5–6 (budgets, the episode
  output), §8 (the clip from plies), §9 (the level), §11.

Commit: `docs: plies, budgets and the curriculum order`

## Phase 91 — Course, clip or both; key moves always speak

The owner, 2026-09-28, after the first AI run with budgets: "not every
session should have long and short clip; at the beginning we pick one or
both; later the user can manually add the other one, but the planner plans
only for that type". The same run left 8…Qc1#, the move the Englund trap
builds to, silent: the planner gave the punish episode 3 of its 4 moves.

**Spec:** `docs/courses.md` §4 (the document), §5.3 (the intake), §6.4–6.5
(budgets), §7 (the verifier), §10 (the template). Read only those sections.

**Already there, reused as is (verified in code):** plies with `long` /
`short` ticks and per-episode budgets (Phase 90); the editor's ticks
already let the creator add either version by hand; `withKeyMoves` is new
here.

### Task 91.1 — Key moves

**Read:** `packages/chess-analysis/src/course-verify.ts`,
`apps/api/src/services/courses/generate-outline.ts`.
**Files:** `course-key-moves.ts` (new), `course-verify.ts`,
`generate-outline.ts`, `generate-episode.ts`, `manual-notes.ts`,
`packages/prompts/src/course/episode.ts`, `packages/shared/src/course.ts`,
their tests.

- [x] `episodeKeyMoves`: an episode's moves that must speak: the quiz
  answer, a mate, and for a trap its bait, answer and last move; none for
  a hook or a safety episode.
- [x] After the outline is accepted (or falls back), code raises each
  planned version's budget to fit the key moves and stores them
  (`budget.keyNodeIds`); the episode prompt names them ("Must speak").
- [x] The verifier's `key-moves` check: a key move silent in a planned
  version is a problem (sent back once, then a warning).
- [x] The template ticks key moves in the clip first.

### Task 91.2 — Course, clip or both

**Read:** `CourseIntakePage.tsx`, `packages/prompts/src/course/outline.ts`,
`episode.ts`, `CourseDetails.tsx`.
**Files:** `packages/shared/src/course.ts`, `course-api.ts`,
`apps/api/src/services/courses.ts`, `generate-outline.ts`, the prompts,
`manual-notes.ts`, `CourseIntakePage.tsx`, `CourseDetails.tsx`, their tests.

- [x] `document.versions: { long, short }` (at least one; absent reads as
  both). The intake asks "What to make": Course and clip, Course, Clip.
  Default: Clip for an opening reel, Course for an opening course or a
  master game, both for a trap or tactics.
- [x] The outline prompt plans only the chosen versions: an unplanned
  version's budgets are 0, set by code whatever the model answers. The
  episode prompt says which tick stays false on every move.
- [x] The template ticks only the chosen versions.
- [x] The verifier's budget checks skip a version the plan gave 0, so a
  creator who adds the other version by hand gets no budget warnings.
- [x] The Details card shows What to make and lets the creator change it
  (it applies to the next Start over).

Status: done 2026-09-28. The Details card's picker reads "The AI makes".

Commit: `feat(courses): course, clip or both; key moves always speak`

## Phases 92–95 — The course, the YouTube video and the reel

The owner, 2026-09-28: the "long" and "short" versions are two videos, not
the course and one clip. The long clip is a YouTube video; the short clip
is a reel for Instagram, YouTube Shorts and TikTok. A course may have
either, both or neither; the course always holds everything. The reel is
"one idea" (a single sacrifice, blunder or finish, never a 40-move
summary) or an interactive puzzle ("Mate in 3"); the video tells the story
and, at each important move, weighs the moves that look right and says why
they fail. `opening_reel` and `opening_course` become one `opening` kind;
`puzzle` is new. The owner's research on reels (9:16 layout with a top-band
hook and a bottom-band payoff, 30–45 s, a spoken keyword hook in 2 s, the
slowed climax with silence before the winning move, a specific CTA and a
loop line) and on long form (a 15-second premise hook, commentator
storytelling, the eval bar, an interactive question and a series CTA, a
title under 55 characters) is folded into the spec.

**Spec:** `docs/courses.md` §13 (all of it; the tasks name subsections).
Do not read the rest of the file end to end.

**Already there, reused as is (verified in code):**
- the dossier's `tempting` (captures and checks the engine did not rank,
  `course-dossier-node.ts` `temptingMoves`), with no refutation yet;
- engine lines carry `pvSan` (`EngineLineSchema`);
- `checks-captures-threats.ts` for the candidates;
- the clip renderer (`clip/draw-frame.ts`, `timeline.ts`, `clip-player.ts`,
  `record-clip.ts`) draws 9:16 and 16:9 from one timeline;
- board sounds and ducking (Phase 88);
- key moves and code-owned budgets (Phase 91).

**Layering:** chess facts in chess-analysis, prompt text in
`packages/prompts`, the pipeline in `apps/api/src/services/courses`, the
renderer in `apps/web/src/features/courses/clip`. Course rows are test data:
no backward compatibility, and the kind check constraint changes in a new
migration.

## Phase 92 — Kinds and the document

### Task 92.1 — `opening` and `puzzle`

**Read:** §13.2.
**Files:** `packages/shared/src/course.ts` (`COURSE_KINDS`, roles),
migration `00NN_course_kinds.ts` (check constraint; existing opening rows
become `opening`), `course-skeleton.ts` (opening merged; puzzle: every
learner move a quiz), `course-learner-side.ts` (puzzle: the side to move),
intake (`CourseIntakePage.tsx`, `courseKinds.ts`), the template
(`manual-episodes*.ts`), playbooks, their tests.

- [x] Failing tests first: the puzzle skeleton on a smothered mate in 2
  (each learner move asked; the defence as the replies). The intake refuses
  a puzzle without a `[FEN]` or with sidelines. Whether each move is the one
  clear best needs the engine, which runs after intake, so the skeleton
  lists those moves (`unsoundNodeIds`) and the puzzle playbook tells the
  model; the editor warning comes with 93.3.
- [x] `opening` replaces both opening kinds everywhere (roles: line,
  deviation, trap, recap); migration 0022 rewrites the rows and their
  documents.
- [x] The intake lists five kinds with their summaries and examples.

Commit: `feat(courses): one opening kind, and puzzles`

### Task 92.2 — The document: course, video, reel

**Read:** §13.1, §13.6.
**Files:** `packages/shared/src/course.ts`, `course-api.ts`, every user of
`opener`, `clipText`, `short`, `versions`, `clipSeconds` (verifier,
timeline, editor, player, pipeline, template), tests.

- [x] Ply: `text`, `say?`, `caption?`, `tempting?: {san, why}[]`, `course`,
  `video`; episode `budget: {course, video, keyNodeIds?}`; document
  `videos`, `video?`, `reel?`. The intake's "Videos" choice (Reel, YouTube video,
  Both; one is required, the kind preselects it per §13.2) replaces "What
  to make". The course is always made. (Done with the above.)
- [x] The editor and player compile against it. The Clip tab is now the
  Video tab (this episode's part of the video); the video opens on
  `video.hook` in place of the episode openers (audio key `video:hook`).
  The shared prompt block already describes the three products, since its
  field names changed; the rest of 93.1 stays.

Commit: `feat(courses): the course, the video and the reel in the document`

### Task 92.3 — Tempting moves with their refutation

**Read:** §13.5.
**Files:** `course-tempting.ts` (new), `course-dossier-node.ts`,
`course-dossier.ts` (the extra positions go in the same engine batch),
`course-dossier-text.ts` (rendering), tests.

- [x] Failing test first: on the Englund at n12 (6…Bb4) the candidates are
  Black's check and captures, the rook before the knight; kept only when the
  engine says they fail, at most 3, each with the engine's answer.
- [x] Candidates: checks, captures, threats (attacks an undefended piece or
  one worth more); at critical nodes, quiz answers, and every learner move
  of a puzzle or tactics course; at most 6 to the engine, 3 kept.
- [x] `course-dossier-refresh.ts` rebuilds dossiers (it passes the kind).

Commit: `feat(courses): tempting moves and why they fail, from the engine`

## Phase 93 — Prompts and the pipeline

### Task 93.1 — Three products in the prompts

**Read:** §13.7, §13.2.
**Files:** `packages/prompts/src/course/shared.ts`, `playbooks.ts`,
`outline.ts`, `episode.ts`, `budget.ts`, snapshot tests.

- [x] The shared block's "three products" (§13.7) replaces "each move, two
  versions"; every playbook gains its video and reel paragraphs, and the
  puzzle playbook is new (the thinking method: checks, captures, threats at
  every learner move).
- [x] The outline: course and video budgets, the reel's style and span from
  code's candidates, the video's title, thumbnail text, hook and outro;
  only for the ticked videos.
- [x] The episode: `text`, `say`, `tempting` (from the dossier's list),
  ticks within budgets.
- [x] Voice rule: never start two lines the same way; no stock words
  repeated across the course.

Commit: `feat(courses): prompts for the course, the video and the reel`

### Task 93.2 — The reel call

**Read:** §13.3.
**Files:** `packages/prompts/src/course/reel.ts` (new),
`apps/api/src/services/courses/generate-reel.ts` (new),
`course-reel-candidates.ts` (chess-analysis, new), `course-generate.ts`,
tests.

- [x] Code's reel candidates: climaxes ranked (mate, brilliant or great,
  largest swing, a trap's punishment) with their spans.
- [x] One call after the episodes writes the §13.3 script; checked (93.3),
  sent back once, then kept with warnings.
- [ ] `POST /api/courses/:id/generate` takes `{ only: 'reel' | 'video' }`
  to add one later. Moved to 95.1, with the editor's "Add a reel".

Commit: `feat(courses): the reel, one idea, written and checked`

### Task 93.3 — The checks

**Read:** §13.9.
**Files:** `course-verify*.ts`, `course-verify-reel.ts` (new),
`packages/shared/src/constants` (`GENERIC_CTAS`, `VIDEO_INTRO_PHRASES`),
tests.

- [x] Every row of §13.9, each with a failing test first.
- [x] A puzzle move with a second good answer (`unsoundNodeIds`) is a
  warning in the editor.

Commit: `feat(courses): checks for tempting moves, the reel, the video and the voice`

### Task 93.4 — The golden set

**Files:** `apps/api/test/fixtures/courses/`, `course-golden.ts`.

- [x] One fixture per kind (a smothered mate in 2 added, the openings as one),
  printing the video and reel scripts.
- [ ] The owner runs it (their unlock phrase and credits).

Status: code done 2026-09-29. The outline picks the reel from code's
candidates (`course-reel-candidates.ts`) and writes the video's packaging;
code keeps only what the course makes (`withProducts`). The reel call runs
after the episodes, one more step; its warnings carry `episodeId: 'reel'`.
The whole-course checks (`verifyCourseFrame`: the video's packaging, the
voice across episodes) and a puzzle's second answers are warnings at the
end of a run. The golden script prints the video and the reel.

Commit: `test(courses): golden set for five kinds and three products`

## Phase 94 — The videos

### Task 94.1 — The reel

**Read:** §13.3, §13.8.
**Files:** `clip/reel-timeline.ts` (new), `draw-frame.ts` (9:16 bands),
`clip-player.ts`, `scripts/sounds/generate-board-sounds.py` (`riser`,
`whoosh`), tests.

- [x] Failing timeline tests first: the build-up at 500 ms a move; 0.5 s of
  silence then the climax at half speed; a puzzle's 5 s countdown over the
  riser; the total within 30–45 s; the promo stops before the climax.
- [x] The top band (`topText`) from frame one; captions in the bottom band;
  the payoff at the climax; the CTA card; the loop line last.

Commit: `feat(courses): the reel, 9:16, one idea`

### Task 94.2 — The YouTube video

**Read:** §13.4.
**Files:** `clip/video-timeline.ts` (new, from `timeline.ts`),
`draw-frame.ts` (16:9, chapter cards, the ghost arrow), tests.

- [x] Failing tests first: the hook plays over the climax, then the start;
  a chapter card per chapter; a tempting move plays with its refutation and
  returns before the real move; the outro question card.

Commit: `feat(courses): the YouTube video, with the tempting moves played out`

### Task 94.3 — Recording and audio

**Files:** `record-clip.ts`, `prepare-audio.ts` (keys `video:`, `reel:`,
`tempting:`), `ClipPreview.tsx`.

- [x] Each product records in its own shape (the video 16:9, the reel 9:16),
  all audio first as before (Kokoro only).

Status: done 2026-09-29. `timeline.ts` is the YouTube video's
(`buildVideoTimeline`: the hook over the climax and a whoosh back to the
start, a card per chapter, each tempting move shown with a red arrow while
the coach says why, played out with the engine's answer, then taken back;
the outro card). `reel-timeline.ts` is the reel's. The tempting moves'
refutations are copied onto the plies by code from the dossier. The
preview picks "YouTube video (16:9)" or "Reel (9:16)"; the downloads are
`<slug>-youtube` and `<slug>-reel`. Riser and whoosh come from
`scripts/sounds/generate-clip-sounds.py`; the board sounds are untouched.

Commit: `feat(courses): record the video and the reel`

## Phase 95 — The editor and the player

### Task 95.1 — The editor

Done 2026-09-29: `POST /api/courses/:id/reel` writes the reel alone (one
model call) and `useWriteReel` calls it. `CourseProducts.tsx` under Details
shows a YouTube video card (title, thumbnail text, hook, outro; a hint when
no episode plans the video, i.e. it was added by hand) and a Reel card
(style, span, top text, hook, beats, payoff, CTA, loop, "Write the reel with
AI", the reel's warnings). The Moves tab edits a move's tempting moves (the
why; remove). The Details "Videos" picker is the "Add a video/reel" switch.
The span is shown, not edited: "Write the reel again with AI" re-picks it.

**Files:** `CourseDetails.tsx` (Videos ticks, "Add a reel"/"Add a video"),
`CourseEpisodePanel.tsx` (Moves: course and video ticks, the video line,
the tempting moves with their why), a Video tab (title, thumbnail text,
hook, outro, preview) and a Reel tab (style, span on the move list, top
text, beats, payoff, CTA, loop, preview), tests.

Commit: `feat(courses): edit the video and the reel`

### Task 95.2 — The player

Done 2026-09-29: tempting moves fold under the note (`PlayThrough.tsx`);
a puzzle's every learner move is a quiz answer (`isQuizAnswerEligible`
for 'puzzle', and `puzzleChapters` quizzes every solve episode; an equal
alternative is accepted by the player's engine check); "Watch the video"
(YouTube) and "Watch the reel" (Shorts in the dialog; Instagram or TikTok
open there) replace "Watch the clip", and the Publish dialog names them.

**Files:** `PlayThrough.tsx`, `CoursePane.tsx`, `CourseDrill.tsx`,
`PublishedCourse.tsx`, tests.

- [x] Under a note: "Tempting: Qxf7+? Kxf7, and the knight hangs",
  folded by default.
- [x] Puzzle courses play as solve mode: every learner move is asked.
- [x] The course page embeds the YouTube video and links the reel
  (`clipLinks`: youtube for the video; shorts, instagram, tiktok for the
  reel).

Commit: `feat(courses): tempting moves and puzzles in the player`

### Task 95.3 — Docs

- [x] Rewrite `docs/courses.md` §3, §4, §6, §8, §10 from §13, then fold
  §13 into them; `docs/architecture.md`'s Courses section. (Done
  2026-09-29: §1, §3–§10 describe the three products; §13 keeps the
  reel, video, tempting, sound and check details and points to §4 and §6
  for the document and the calls. The trap and opening playbooks' headers
  lost "vertical reel" / "landscape video".)

Commit: `docs: the course, the video and the reel`

## Phase 96 — Facts the words need, and only moves worth discussing

The strong model's Englund run (2026-09-29) was correct except where our
facts were thin or the choice was ours. Most of the tempting moves were a
queen taking something defended and being taken back, which a club player
sees at a glance. At 8…Qc1# one "why" read "winning the knight… White's
queen returns to b2": the dossier only described the answer (Qxb2), with no
subject and nothing about Nxe5 itself. The safety episode only said the setup
is "risky". It never said what the trapper does when the victim finds the
safe move. The video was aimed at a fixed 5 minutes for traps and puzzles,
and a one-word overshoot cost a repair call. The app supplies the facts; the
model only words them.

### Task 96.1 — Tempting moves: the move's own facts, the material, no obvious ones

**Files:** `course-material.ts` (new, chess-analysis), `course-tempting.ts`,
`course-dossier-text.ts`, `config.ts`, tests.

- [x] `CourseTemptingFacts` gains `does` (the tempting move's own board
  facts) and `captures` (who takes what over the move and its refutation:
  "Black takes a pawn; White takes the queen").
- [x] The dossier text names the sides: "Nxe5? Black's Nxe5 captures the pawn on e5.
  White answers Bxb4: captures the queen on b4. Over the line Black takes a
  pawn; White takes the queen (White is much better)".
- [x] A candidate whose engine answer captures at once and leaves the mover
  at least `CONFIG.courses.obviousLoss` (2) points down is obvious, not
  tempting: dropped. A quiet reply that mates stays: the back-rank mate is
  the classic tempting move.
- [x] Failing test first: on the Englund at n12, Qxc3+, Qxa1 and Qxb1 are
  dropped (each loses the queen to the recapture).

Commit: `feat(courses): tempting moves say what they do, and obvious ones go`

### Task 96.2 — When the victim defends: the trapper saves what they can

**Files:** `course-material.ts`, `course-dossier-node.ts`,
`course-dossier-text.ts`, `playbooks.ts`, tests.

- [x] `bestInstead` gains `balance`: the material at the end of its line
  ("White is a pawn up", "material is level").
- [x] The trap playbook's safety episode: the safe move, then what the
  trapper plays when the victim finds it (the engine's line after the safe
  move), how it stands and the material. Say it plainly; don't pretend the
  trap still works.

Commit: `feat(courses): the trap's safety episode says how the trapper limits the damage`

### Task 96.3 — Video length is a guide

**Files:** `config.ts`, `budget.ts`, `outline.ts`, `episode.ts`,
`course-verify.ts`, `course-verify-reel.ts`, tests.

- [x] `CONFIG.courses.videoSeconds` per kind becomes a range: trap 2–5
  min, opening 8–15, tactics 5–10, puzzle 1.5–4, master game 8–15. The
  words cap is the top of the range.
- [x] The outline says the range is a guide, not a target: every point the
  dossier supports, nothing added to fill time.
- [x] Lengths (video words per episode and per move, the video hook, the
  reel's seconds) may run over by `CONFIG.courses.lengthSlack` (10%)
  before they count as a problem: a 41-word hook doesn't cost a repair.

Commit: `feat(courses): the video's length is a guide, with slack`

### Task 96.4 — Docs

- [x] `docs/courses.md` §13.4, §13.5, the trap playbook text and §7 match.

Commit: `docs: tempting moves worth discussing, the trapper's defence, video length`

## Phase 97 — A hook that speaks, and no analysis words in the coach's mouth

The Englund rerun after Phase 96 (2026-09-29) had no obvious tempting moves
and a correct safety episode. Two faults were ours. The hook ended silent: the
plan gave it a budget of 0, and the verifier told the model "the caption on n1
has 7 words" when it had written no caption (the video falls back to the
line's first sentence); the model moved its words into the caption and left
the line empty. And two notes read like our notes ("in the listed line", "its
line ends with material level"), copying the dossier's "(line: …; at its end
…)". The reel's loop "Set the queen trap in the" is by design: it runs into
the hook.

### Task 97.1 — The hook's line, and the caption check

**Files:** `course-verify.ts`, `generate-outline.ts`, tests.

- [x] With no caption, a long first sentence asks for a caption of at most 6
  words and says to keep the line.
- [x] `withKeyMoves` raises a hook's course and video budgets to at least 1.

Commit: `fix(courses): the hook keeps its line`

### Task 97.2 — Best-instead in plain chess words

**Files:** `course-dossier-text.ts`, `playbooks.ts`, `docs/courses.md`, tests.

- [x] The dossier row reads "best instead: Qe7; after Qe7 Nc3 Nxe5 e4 Nf6,
  material is level"; the trap's defence text reads "best play goes …, and
  then …".
- [x] `docs/courses.md` matches (§7 Lengths, the key-moves budgets, the
  dossier example, `{trapperDefence}`).

Commit: `fix(courses): best-instead in plain chess words`

## Phase 98 — A branded start, the board follows the words, and the trap's why

The owner's review of the Englund video (2026-09-29): the video should open
on the site's logo, the coach and the site's name, and the first slide should
be livelier than a dark card. A line naming several squares and moves is hard
to follow without the board showing them. And the trap should say why the
victim walks into it, where each of their moves goes wrong, and what the
trapper plays when the victim does not fall for it, shown on the board rather
than only listed in words.

### Task 98.1 — The start slide

**Files:** `clip/draw-frame.ts`, `clip/ClipPreview.tsx`, `clip/timeline.ts`, tests.

- [x] The video's first segment (the hook) no longer covers the board with a
  card: the climax board stays in view; the side panel shows the logo on a
  light tile and "freechesscoach.org", the thumbnail text large, the course
  title, and the coach's full portrait with their name. The panel's parts
  slide in one after another over the first half second.

### Task 98.2 — The board follows the words

**Files:** new `clip/speech-marks.ts`, `timeline.ts`, `reel-timeline.ts`, `draw-frame.ts`, tests.

- [x] Code reads each spoken line (the hook, a move's line, a tempting move's
  why, the reel's hook and beats): a square it names ("the king on e1",
  "c1") lights up, and a move it names that is legal on the board shown
  gets an arrow. Each appears when the words reach it (its place in the text
  times the audio's length) and fades after 1.8 s. Moves already on the
  board and moves not legal there get nothing: code never guesses.

### Task 98.3 — The trap's why

**Files:** `playbooks.ts`, `course-prompts.test.ts`, `docs/courses.md`.

- [x] The bait item gets its facts: what the trapper's move before it
  threatens, what the bait does against it, and what it misses (the bait's
  tactic row): "say what the victim wants and what they miss".
- [x] The punish item lists the victim's errors on the line from the bait,
  each with its best move and the material after it: where even the best
  loses, the coach says so rather than calling it safe (the last run called
  7.Bd2 "safer" when it drops a rook).

### Task 98.4 — The safe line on the board

**Files:** `packages/shared/src/course.ts`, `generate-episode.ts`,
`manual-episodes.ts`, `timeline.ts`, tests, `docs/courses.md`.

- [x] A ply may carry `playOut`: moves off the tree, copied by code. The
  safety episode's line at the bait gets the safe move and the engine's line
  after it (`bestInstead.line`).
- [x] The video shows the board before the bait and plays that line while the
  coach speaks, the moves spread over the line's audio.

Commit per task; docs with the last.

## Phase 99 — What three new traps showed

Runs after Phase 98 (2026-09-29) on the Englund, the Blackburne Shilling,
Légal's mate and the Elephant trap. The bait now says why the victim walks
in, the punish is honest about the victim's best, and the safe line plays on
the board. The faults:

- The Elephant's hook, reel and quiz say Black "wins the queen"; the trap
  wins a knight for a pawn (the queens come off). The model had the answer's
  move but no fact for what the line wins, and no material for a trap that
  does not mate.
- Two safety lines name pieces that are not there: "keeps the knight on d5
  safe" after 6.e3 (the knight is on c3), "keeps your bishop on d1 safe" after
  5…dxe5 (the queen is on d1).
- The Elephant's safety line tells the trapper to do "damage control" in an
  equal position: `trapperDefence` always says "lose as little as possible".
- The Blackburne and Légal mates discuss tempting moves at the mating move
  ("Nf3#. Nxe2? Ng5 hits the queen…"), and the safety and recap episodes
  repeat the bait's tempting moves, so the video plays them twice.
- "the listed line", "the given line", "no listed capture", "and the
  continuation" are our words again.

### Task 99.1 — What the trap wins

**Files:** `playbooks.ts`, `course-prompts.test.ts`, `docs/courses.md`.

- [x] The quiz item gets the line from the answer to the end, who takes what
  over it (`captureWords`) and the material at the end (`lineBalance`):
  "From the answer: Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8; Black takes a knight,
  the queen and a bishop; White takes a pawn, the queen and a bishop; at the
  end Black has a knight for a pawn."
- [x] `trapEnding` for a trap that does not mate names the material at the
  end, and says to promise that and nothing more.

### Task 99.2 — The trapper's side matches the position

**Files:** `playbooks.ts`, tests.

- [x] `trapperDefence` says "lose as little as possible" only when the
  trapper stands worse after the line; level: "the game goes on level: name
  the plan"; better: "the trapper keeps an edge".

### Task 99.3 — Pieces the line names are on the board

**Files:** `course-verify-text.ts`, `course-verify.ts`, tests.

- [x] "the knight on d5", "your bishop on d1", "White's queen on b2": the
  piece must stand on that square in a position the line is about: before or
  after its move, or on its tempting and safe lines. The safety episode's
  line on the bait is about the position before the bait and the safe line,
  not after the bait.

### Task 99.4 — Tempting moves once, and never at a mate

**Files:** `course-tempting.ts`, `generate-episode.ts`, tests.

- [x] Outside a puzzle or tactics course, a mating course move gets no
  tempting moves.
- [x] A node's tempting moves are kept only in the first episode that
  discusses them; a safety episode keeps none.
- [x] Each tempting move carries the material at its line's end
  ("Over the line …; at the end Black is a queen up").

### Task 99.5 — No "listed line"

**Files:** `course-verify-text.ts`, tests.

- [x] "listed", "given line" and "the continuation" are flagged like
  "dossier": the learner never sees our list.

Commit per task; docs with the last.

## Phase 100 — Puzzles: why every other check fails

The owner (2026-09-29): in a puzzle, the coach must say why the other checks
and captures are not correct. The smothered-mate run (1.Nf7+ Kg8 2.Nh6+ Kh8
3.Qg8+ Rxg8 4.Nf7#) said "Ng6+ misses the mate-in-four target" with no
reason (hxg6 takes the knight), because the engine's ranked moves are never
tempting moves and the dossier gives them a verdict only. It also flagged
every move as unsound and not quiz-eligible: a slower mate counted as a
second answer. Quiz prompts named the answer ("Nf7+ or Ng6+?"), and the
two-sentence limit fought the checks-captures-threats walk.

### Task 100.1 — The fastest mate is the one answer

**Files:** `course-dossier-node.ts`, `course-skeleton.ts`, tests.

- [x] A move is quiz-eligible when it is the engine's best and either beats
  the second by `onlyMoveGap`, or mates and the second does not mate or mates
  later. A puzzle's second solution is a move that mates as fast.

### Task 100.2 — Every other check, with its answer

**Files:** `course-tempting.ts`, `config.ts`, tests.

- [x] At a puzzle's or tactics course's learner move, the engine's ranked
  moves are candidates too; every check is kept (no `temptingDrop`, no
  obvious-loss filter), and a move that mates later or not at all where the
  course move mates is kept; up to 5 a move.

### Task 100.3 — The solve episode names them

**Files:** `playbooks.ts`, `course-verify.ts`, tests, `docs/courses.md`.

- [x] The playbook: at each learner move, every check in the tempting list,
  then the captures, each with why it fails (the answer and what it leaves).
- [x] The verifier: a solve episode's learner move discusses every tempting
  check the dossier lists there; a quiz prompt never names the answer; a
  solve line may have 5 sentences.

Commit per task; docs with the last.

## Phase 101 — Course calls cache what they share

The owner (2026-09-29): the cached inputs are not used fully. The call log
of a puzzle run on gpt-6-luna: from the second episode on, each call read
~1,900 tokens (the system prompt) from the cache and wrote ~1,900 more (the
user message) that no later call ever read. The user message varies from its
first block on: the outline marks "<- THIS EPISODE", and the constant output
schema comes last. Course calls pass the system prompt as a plain string, so
OpenAI places one implicit breakpoint on the latest message and writes the
whole prompt every time (`llm/messages.ts`).

### Task 101.1 — A shared head, then the episode

**Files:** `packages/prompts/src/course/episode.ts`,
`context.ts`, tests.

- [x] `CourseMessages` gains `shared`: the user message's head that every
  episode call of a course repeats byte for byte: the course, the outline
  (no "<- THIS EPISODE" marker: the episode block names it) and the output
  schema. `user` is the rest: this episode, its dossier, a request, a retry.

### Task 101.2 — Explicit breakpoints

**Files:** `apps/api/src/llm/text.ts`, `services/courses/debug-log.ts`, tests.

- [x] A structured call with `shared` sends the system prompt as a cached
  system message and the user message as two parts, the breakpoint after
  `shared`: later calls read both, and the episode part is sent fresh instead
  of written to the cache. The debug snapshot shows both parts.

Commit per task; push each phase.

## Phase 102 — Every video move has a caption

The gambit runs (2026-09-29) repaired nearly every episode for one reason:
"n7 has no caption, so the video shows its first sentence (11 words)". The
shared block told the model to write a caption "only when the line's first
sentence would not do", and the verifier asks for one whenever that sentence
is over 6 words, which it nearly always is. A repair is a whole second call.

### Task 102.1 — Ask for the caption the verifier wants

**Files:** `packages/prompts/src/course/shared.ts`, `episode.ts`, tests,
`docs/courses.md`.

- [x] The shared block and the episode's budget line ask for a caption of at
  most 6 words on every move with "video": true.

Commit and push.

## Phase 103 — Endgame courses

The owner (2026-09-29): add endgames. An endgame course is a position and its
technique: the Lucena, the Philidor, king and pawn against king. It is taught
the way a strong player learns one: the goal, the one idea that decides it,
then the technique move by move, where only one move keeps the result, and
what the defender tries.

### Task 103.1 — The kind

**Files:** `packages/shared/src/course.ts`, migration `00NN_course_kind_endgame.ts`,
`course-learner-side.ts`, `course-review.ts`, `config.ts`, `ask-coach.ts`,
web `courseKinds.ts`, `CourseIntakePage.tsx`, tests.

- [x] `endgame` joins `COURSE_KINDS`, the database's kind check, the intake
  (with the other kinds' card and icon) and every per-kind table: roles
  `goal`, `technique`, `defence`, `recap`; the video and a reel by default;
  3 to 8 minutes; the learner's side in review.
- [x] Like a puzzle it needs a `[FEN]` (the form says so); unlike one it may
  have sidelines: the defender's tries. The learner is the side to move.

### Task 103.2 — The skeleton

**Files:** `course-skeleton.ts`, `course-tempting.ts`, `course-outline-check.ts`,
`course-key-moves.ts`, tests.

- [x] `EndgameSkeleton`: the main line, the goal (`win` when the engine gives
  the learner a winning position at the start, else `draw`), the material
  in words, the learner's moves, the only moves (quiz-eligible learner
  moves), the defender's tries (sidelines' first moves).
- [x] Every learner move gets tempting moves as a puzzle's do (a move that
  spoils the result is the lesson); the only moves are the quiz answers.

### Task 103.3 — The playbook and the manual path

**Files:** `playbooks.ts`, `outline.ts`, `manual-episodes*.ts`, tests,
`docs/courses.md`.

- [x] KIND: ENDGAME: the goal and the material; 1. goal (the idea that
  decides it, in plain words), 2. technique (every learner move speaks; the
  only moves are quizzes; the tempting moves say what they spoil: the win
  becomes a draw, the draw a loss), 3. defence (one per sideline: the try
  and the answer), 4. recap (the rule, and how to spot the position in a
  game). The video: the goal, the technique with the moves that spoil it,
  each try. The reel: one only move as a puzzle.
- [x] Without AI, code builds the same episodes.

### Task 103.4 — A real run

- [x] A Lucena course is created and generated; its episodes are checked
  against the engine. The goal (a win, mate in 21), the material and the five
  only moves were right, and the tempting moves correct ("Rd7+? Kxd7",
  "b8=N+ only draws"). Fixed after it: the reel (the technique's last move as
  a puzzle), tempting moves kept out of the goal and recap, and a technique
  line may run 5 sentences.

Commit per task; push each phase.

## Phase 104 — The Studio's layout

The owner (2026-09-29): improve the Studio; put the sidebars under the chess
board so the fields have more space. At 1920 px the editor's left column was
3,300 px tall: the course details, the YouTube video and the reel stacked in
260 px, with the episode list, the editor's navigation, at its very bottom.

### Task 104.1 — Sections and the episode workspace

**Files:** `CourseEditorPage.tsx`, `CourseEditor.css`, `CourseOutline.tsx`,
`CourseBoardPanel.tsx`, `CourseEpisodePanel.tsx`, `CourseDetails.tsx`,
`CourseProducts.tsx`, `CourseGenerationBar.tsx`, tests.

- [x] Under the header, three sections as tabs: Episodes (the default),
  Course (coach, level, videos, promise) and Videos (the YouTube video and
  the reel, shown when the course makes them), each at full width.
- [x] Episodes: the episode list on the left, the board (sized to the
  screen's height, its moves under it) in the middle, the editor on the
  right; the list and the board stay in view while the editor scrolls, the
  list scrolling on its own. From 1001 to 1280 px the list goes under the
  board so the editor keeps its room. (The owner asked to keep the list on
  the left after a first version put it under the board.)
- [x] The episode list: each episode's number, role, focus (two lines), its
  moves ("1.Rd1+ – 7.Rb4") and a quiz mark.
- [x] The editor's head: "Episode 2 of 9", the role, previous and next
  episode. The arrow keys step through the moves when no field has focus.
- [x] The writer's progress and "Write with AI" stay above the sections, so
  they show on every tab; nothing shows when there is nothing to say.
- [x] Below 1000 px everything stacks: the board, the moves, the editor, the
  episode list.

Commit per task; push each phase.

## Phase 105 — Branch review fixes

The owner (2026-09-29) asked for a review of `claude/courses` against `main`
and for its findings to be fixed.

### Task 105.1 — One writer at a time

**Files:** `apps/api/src/services/courses.ts`, `course-generate.ts`,
`CourseEditorPage.tsx`, `CourseEditor.css`, tests.

- [x] A run holds its own copy of the document and saves it after each
  episode, so while it is live (`notBeingWritten`) the server refuses a
  second start, a restart ("Start over… → With AI" used to slip past), a
  saved draft, a rebuilt skeleton, a regenerated episode and a reel.
- [x] The editor is no longer rebuilt whenever `updatedAt` changes (a
  refetch on window focus threw unsaved edits away; the run's polling reset
  the episode, the section and open dialogs). A newer server copy is taken in
  place, keeping the episode and section, and only when nothing is unsaved.
- [x] While the AI writes, the editor's fields are locked and Start over is
  off; the list and the board still browse. Edits made while a save is in
  flight stay unsaved.

### Task 105.2 — Smaller bugs

- [x] "Ask my coach": the coach's own replies no longer hit the 2000
  character limit on the next question.
- [x] The clip preview: Record during playback stops the playing loop first.
- [x] The Courses page loads every page of public courses ("More courses").
- [x] `course.test.ts` used `endgame` as its unknown kind; endgame is a kind
  since Phase 103.

### Task 105.3 — Shared helpers

- [x] One zod-issues-to-`ValidationError` helper for the course routes
  (`lib/parse-request.ts`); the older routes on `main` keep their own.
- [x] One "position before a move" and "6.Bc3 / 6…Bb4" label in
  `chess-analysis` (`course-moves.ts`), used by the drill, the editor, the
  clip, the review and "Ask my coach" (which spells Black's dots "...").

Commit per task; push each phase.

## Phase 106 — More golden courses, and the facts they showed wrong

The owner (2026-09-29): make more variations of courses and look for bugs
and room to improve in what the recordings will say. Every fault so far was
found on a position the golden set did not have. A facts-only pass (no model,
the dev stack's engine) over 13 new courses showed the facts themselves wrong
before any model wrote a word:

- Réti–Tartakower 9.Qd8+: "You saved a hanging piece — saves the bishop on
  d2"; 11.Bd8#: "moves the bishop off g5, out of reach". The game review's
  defensive motifs, on a queen sacrifice and a mate.
- "the queen on g8 forks the rook on a8 and the king on h8" (Philidor's
  Legacy 3.Qg8+, the rook takes it); Nd6# "forks the bishop on c8".
- "h1 is covered by ." and "b6 is covered by ;": a square covered through
  the mated king has no attacker in chess.js until the king moves off it.
- "You forced mate through a checkmate."
- King and pawn, and the Lucena: "White to play and hold the draw". A won
  endgame reads "much better", never "winning", without a tablebase. The
  Philidor: "Black to play" when White moves first.
- The Caro-Kann course: 1…c6 "best instead: c5"; the trap's 5.Qe2 "best
  instead: Nf3". A book or good move gets a "better" move nobody should
  play.
- Noah's Ark ends on 11…c4 "attacks the bishop on b3", material level: the
  trapped bishop is the whole trap and nothing said so.
- The Elephant bait: nothing said the knight on f6 is pinned to the queen,
  which is why Nxd5 looks safe.
- Marshall's 23…Qg3, the game's point, got one line: past 40 moves only
  notable moves get their facts, and the last move was not one of them.
- The Caro-Kann Nd6# trap has no punish episode (the answer mates), yet the
  playbook lists six episodes with a punish item.
- "and then The position is roughly equal", "black is better", "1
  examples", "seen the pattern 1 times".

### Task 106.1 — Golden variations and a facts pass

**Files:** `apps/api/test/fixtures/courses/*.json`, `golden-set.ts`,
`golden-set.test.ts`, `scripts/course-golden.ts`,
`scripts/course-golden-facts.ts` (new).

- [x] Fixtures are named `<kind>-<name>.json`, several per kind (19): the
  Elephant, Blackburne, Noah's Ark and Caro-Kann Nd6# traps; the Caro-Kann
  and Italian openings; the Fried Liver; a knight fork and the four-move
  smothered mate; Réti–Tartakower and Levitsky–Marshall; the Philidor and
  king and pawn.
- [x] `--only` takes a kind or a name; `--facts` prints, with no model, the
  playbook, the reel candidates and each planned episode's facts.

### Task 106.2 — Board facts that hold

**Files:** `course-dossier-words.ts`, tests.

- [x] Mate nets read the board with the king lifted off, so a square covered
  through the king names its piece.
- [x] No fork from a square where the piece is simply taken; a mating move
  lists no attacks or forks.
- [x] An attacked piece pinned by any piece: to the king, or to the queen
  ("which is pinned to the queen on d8 by the bishop on g5").
- [x] An attacked piece with no safe square is named trapped ("the bishop
  on b3 is trapped: every square it can reach loses it"): attacked by a
  cheaper piece, with at least one move, each of which loses it. A piece
  with no move at all (pinned, or in its corner) is not called trapped.

### Task 106.3 — Tactic sentences

**Files:** `tactic-reason-text.ts`, `course-dossier-node.ts`, tests.

- [x] A mate through checkmate reads "forced mate".
- [x] In the course dossier, the defensive motifs (save, retreat, escape,
  block, unpin) are dropped on a check; on a mate only a sentence whose gain
  is the mate stays (17.Rd8# read "You won a knight through a checkmate —
  rook on d8 forks b8 and e8").

### Task 106.4 — The dossier text

**Files:** `course-dossier-text.ts`, tests.

- [x] "best instead" only on an inaccuracy, mistake, blunder or miss.
- [x] Each line's last move always gets its full facts.

### Task 106.5 — Playbooks

**Files:** `packages/prompts/src/course/playbooks.ts`, `context.ts`,
`course-skeleton.ts`, tests.

- [x] An endgame is won when the learner is "much better" or more; the
  goal names who moves and who wins or holds ("White to move; Black holds
  the draw").
- [x] A trap with no punish moves has no punish item, and its episodes are
  numbered to match.
- [x] A trap that ends on a trapped piece says so in the hook's fact.
- [x] Verdicts mid-sentence keep "White"/"Black" capitalised and lower only
  "The"; tactics count "1 example", "once".

The two tempting-move tests in `course-generate.test.ts` build the
Englund's tempting moves in full and ran just past vitest's 5 s default
before this phase too; they get 20 s.

Not fixed here, for the owner: opening courses get no reel candidate unless
a line holds a trap, mate or brilliant move (the London, Italian and
Caro-Kann make no reel); a puzzle's tempting threats that still win (Qd5 in
the four-move smothered mate wins a rook) carry the same "?" as losing ones.

Commit per task; push the phase.

## Phase 107 — A puzzle asks for the best move

The owner (2026-09-29): a puzzle is about finding the best move, not any
move that works. A move that still wins is shown and the coach says why it
is not the answer: it doesn't mate, or it mates later. The facts pass had
Qd5 in the four-move smothered mate (wins a rook) marked "?" like a move
that loses.

### Task 107.1 — "Works, but not the answer"

**Files:** `course-tempting.ts`, `course-dossier-text.ts`,
`manual-notes.ts`, `playbooks.ts`, tests.

- [x] At a solving move, a tempting move after which the mover still stands
  better carries `notTheAnswer`: "it mates too, but in 5 moves, not 4";
  "White is still winning, but there is no mate; the answer mates in 4";
  "…, but the answer is stronger: White is winning". Null when it fails.
- [x] The dossier drops its "?" and adds "Works, but not the answer: …";
  the code-written note leads with it; the puzzle playbook tells the model
  to say it works and why it is still not the answer.

Commit and push.

## Phase 108 — Perfect the facts before the model

The owner (2026-09-29): the bugs keep turning up in what code hands the
model, so keep adding positions and fixing the facts, with no model, until a
facts pass finds nothing. 26 more golden courses, then the facts pass, then
fixes, again until clean.

### Task 108.1 — 26 more courses, and what they showed

**Files:** `apps/api/test/fixtures/courses/*.json`, `course-skeleton.ts`,
`playbooks.ts`, `course-generate.ts`, tests.

- [x] 26 more golden courses (45): the Lasker, Kieninger, Siberian, QGA …b5
  and Stafford traps; the QGD, Najdorf, King's Indian and Scotch; the fork
  trick, the Petrov discovery, a back rank and a skewer; five mates and forks
  as puzzles; the Immortal, the Evergreen and Lasker–Thomas; the rook's-pawn
  draw, two rooks, the square and the opposition draw.
- [x] A puzzle or endgame whose own solution move the engine calls an error
  (`wrongNodeIds`; my first queen fork, 1.Qa4+ …Rxa4) warns the creator, and
  the playbook tells the model never to call it best. Before, it read "the
  engine finds another good move".
- [x] The bait's "What it misses" is the answer and the line from it, not the
  game review's sentence on the bait: the Lasker's read "win a pawn" (the line
  wins the queen), the Kieninger's "win a bishop through a checkmate — knight
  on d3 forks b4, f4, b2, f2 and e1".
- [x] A trapper only slightly worse after the safe move plays on level, not
  "lose as little as possible".
- [x] A trap that ends on an attack (the QGA's 6.Qf3 on the rook) says what
  the last move attacks, so the hook can promise the threat.
- [x] A tactics course whose example mates on the back rank is the back-rank
  theme, not "what a checkmate is".

### Task 108.2 — The second pass over all 45

**Files:** `course-dossier-words.ts`, `course-dossier-node.ts`,
`course-dossier-text.ts`, tests.

- [x] Not trapped when the side is in check (the Petrov's Nc6+ "trapped" the
  queen by checking the king) or can take the attacker (the Immortal's Nb6
  on the rook, answered by …axb6).
- [x] The review's fork detail by squares ("knight on c6 forks b8, d8 and
  a7") is dropped; the sentence keeps its motif and gain.
- [x] A capture taken back is a trade: 3…cxd4 no longer "leaves the pawn on
  d4 hanging".
- [x] A book move carries no verdict: the Najdorf's flipped "roughly equal"
  and "White is slightly better" on every move.

## Verification (end of each phase)

- Targeted tests, lint and typecheck green for every package touched.
- 79: a user without the flag gets 403 on every creator route; the Englund
  PGN becomes a course by hand with the skeleton's bait and quiz.
- 80: the golden set runs; every episode either passes the verifier or shows
  its warnings in the editor.
- 81: one reel and one YouTube clip recorded with browser Kokoro, identical
  timing on a second export.
- 82: a logged-out browser plays an unlisted course by link; a removed course
  is gone.
- 83: a drilled move reappears after the schedule; a miss brings it back
  tomorrow.
- 84: on the Englund trap, practice shows the arrows and then fewer, the drill
  asks only the learner's side, the full drill asks both; practice leaves the
  review schedule alone.
- 85: signed in, leave a course mid-drill; it is in the Continue rail and
  opens at the same move. Signed out, the same works in that browser and moves
  to the account on sign-in.
- 86: the nav reads Games, Courses, Progress, Stats; Play with Coach and Play a
  Bot start from the Games page; a public course is in Browse, an unlisted one
  is not; a finished course is under Learned.
- 87: the Englund trap at 390 px and 1280 px wide looks like Game Review: the
  explorer, the board with its eval bar and graph, the coach; every stage and
  the Remember screen work on both.
- 90: a regenerated Englund trap: each episode within its budget, the coach's
  voice in every line; ticking a move out of the clip removes it from the
  preview; the Courses page in Curriculum order shows 1200-01 before 1200-02.
- 89: `/studio`, `/studio/new` and an editor look like the rest of the app;
  a course is created and edited end to end from the new pages.
- 88: on the Englund trap, a clip and the board: move and opponent knocks,
  a check, the bait's bad sound and the punish's great sound, none over the
  voice; Settings turns them off.
