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
`arrow` → `no_arrow` (played right with the arrow) → `cleared` (right without
it; no longer asked), and a miss goes back to `arrow`. `buildCourseDrill`
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

- [ ] Failing test first.
- [ ] Unfinished courses join the Continue rail as rail cards: a "Course"
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

- [ ] A "Play" section on the Games page under Import games: Play with Coach
  (the learner's coach avatar) and Play a Bot, the same two destinations as
  `PlayPage`'s `DESTINATIONS`, in the Import games card style.
- [ ] Navigation becomes Games, Courses, Progress, Stats, in both the top
  pill nav and the bottom tab bar; a Courses icon in `Icon.tsx`'s stroke
  style. `/play` redirects to `/games`; `/play/new` and `/play-bot/new` are
  unchanged; `PlayPage` and its CSS go.
- [ ] The `/demo` runtime still works (`getDemoRuntime()` routes).

Commit: `feat(nav): play from the Games page, Courses in the navigation`

### Task 86.2 — Course catalogue API

**Read:** `apps/api/src/routes/public-courses.ts`,
`apps/api/src/plugins/route-rate-limit.ts` (`publicCourse`),
`apps/api/src/db/repositories/courses.ts` (`findPublishedBySlug`).
**Files:** those, `packages/shared/src/course-api.ts`, tests.

- [ ] Failing tests first: unlisted, draft and removed courses never appear.
- [ ] `GET /api/public/courses?kind=` lists `public` courses only: slug,
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

- [ ] Failing test first: the three sections render from mocked queries,
  with their empty states.
- [ ] `/courses` becomes the learner's page: **Learning** (unfinished: stage,
  progress, last activity), **Browse** (the catalogue, kind filter chips; a
  badge on courses already learning or learned), **Learned** (finished, with
  moves due for review).
- [ ] The creator's pages move to `/studio`, `/studio/new`,
  `/studio/:id/edit`, with redirects from the old creator paths; the account
  menu item becomes "Course studio" (still creators only).
- [ ] `/courses/:slug` shows the same `CoursePlayer` inside the app shell for
  signed-in users; `/learn/:slug` stays the public page. The Courses page and
  the Continue rail link to `/courses/:slug`.
- [ ] "Remove from my learning" on a Learning card.

Commit: `feat(courses): a Courses page for learning, browsing and learned courses`

### Task 86.4 — Docs

- [ ] `docs/architecture.md`: courses (tables, job, public routes, clips,
  review, enrollments, catalogue, navigation).
- [ ] `docs/courses.md` §11 (the four stages), §9 (the catalogue).
- [ ] Update the AGENTS.md plan pointer.

Commit: `docs: courses, learning and the Courses page`

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
