# FreeChessCoach — Courses and clips (Phases 79–83)

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

**Read:** `docs/courses.md` §7 (last paragraph).
**Files:** `apps/api/scripts/course-golden.ts`, `apps/api/test/fixtures/courses/`
(one small PGN + direction per kind, each under 5 KB).

- [ ] Runs the pipeline against the owner's configured model without writing
  to the database; prints each episode, the verifier result and the call
  count. Record the first run's findings in this task, then tune the prompts
  on it.

Commit: `chore(courses): golden set for judging course prompts`

## Phase 81 — Voice and clips (browser)

### Task 81.1 — Audio preparation

**Read:** `docs/courses.md` §8; `apps/web/src/tts/tts-client.ts`,
`resolve-tts-client.ts`, `persona-voices.ts`.
**Files:** `apps/web/src/features/courses/clip/prepare-audio.ts`, tests.

- [ ] Synthesise every beat and note with the course persona via the chosen
  backend (browser Kokoro, local Kokoro, OpenAI; `native` refused with a
  message). Progress callback. Cache by text hash + persona + backend in
  IndexedDB (wrapped in try/catch, works without it).
- [ ] Nothing is returned until every sentence exists.

Commit: `feat(courses): prepare all coach audio before recording`

### Task 81.2 — Clip renderer and recorder

**Read:** `docs/courses.md` §8; `apps/web/src/features/board/EvalBar.tsx`,
`MoveQualityBadge.tsx`.
**Files:** `apps/web/src/features/courses/clip/` (`timeline.ts`,
`draw-frame.ts`, `record-clip.ts`), tests for `timeline.ts`.

- [ ] Pure timeline: beats → start/end times from audio durations, gaps and
  quiz pauses (tested).
- [ ] Canvas drawing for 1080×1920 and 1920×1080: board, arrows, captions,
  coach avatar, end card with the course link.
- [ ] Record canvas + Web Audio (persona playback rate applied) with
  `MediaRecorder`; MP4 where the browser supports it, else WebM with a note.
  Test on iPhone Safari and desktop Chrome before building further; record
  the result in this task.

Commit: `feat(courses): record reel and YouTube clips in the browser`

## Phase 82 — Publishing and the public course page

### Task 82.1 — Publish and audio upload

**Read:** `docs/courses.md` §8, §9.
**Files:** migration `0014_course_audio.ts`, `repositories/course-audio.ts`,
routes, `services/courses.ts`.

- [ ] Publish copies the draft to `published_document`, status `unlisted`
  unless the creator picks `public`; blocked while verifier warnings are
  unticked.
- [ ] Upload course-note audio (type and size checked; cap per course in
  `CONFIG.courses`), keyed by node id + text hash.
- [ ] Creator pastes clip links (YouTube/Shorts/Instagram/TikTok URLs,
  validated by host).

Commit: `feat(courses): publish courses with their note audio`

### Task 82.2 — Public page

**Read:** `docs/marketing-demo.md` ("Public routes"), `docs/threat-model.md`.
**Files:** `docker/nginx.web.conf`, `deploy/helm/freechesscoach/values.yaml`,
`values.example.yaml`, `deploy/helm/test.sh`, `routes/public-courses.ts`,
`apps/web/src/features/courses/player/`.

- [ ] `/learn/:slug` and the two read-only endpoints public (all three
  places); rate-limited; `removed` and `draft` return 404.
- [ ] Player: embedded YouTube clip when linked; board play-through with
  arrows and note audio; quizzes wait for a move; wrong moves answered with
  the move-quality label and the checked tactic sentence; engine-equal
  alternatives accepted (§11).
- [ ] Threat-model entry for the new public endpoints.

Commit: `feat(courses): public course page, no login`

## Phase 83 — Learning progress and review

### Task 83.1 — Drills and review schedule

**Read:** `docs/courses.md` §11.
**Files:** `packages/chess-analysis/src/course-review.ts` + test, migration
`0015_course_progress.ts`, `repositories/course-progress.ts`, routes.

- [ ] Pure schedule: correct → next step (1 w, 3 w, 9 w, mastered); miss →
  step 0, due tomorrow (tests).
- [ ] Progress keyed by normalised FEN + UCI; drill modes per kind.
- [ ] Anonymous progress in the browser; moved to the account on sign-in.
- [ ] "Due today" card on the Games page.

Commit: `feat(courses): drills and spaced review`

### Task 83.2 — Your own coach on a course

**Read:** `apps/api/src/services/coach-agent-system-prompt.ts`.
**Files:** the course player's "Ask my coach" panel and a course context
block for the coach prompt.

- [ ] The learner's own persona answers, with the course line and notes in
  its context; distinct avatar from the course coach; engine wins over the
  course when they disagree.

Commit: `feat(courses): ask your own coach about a course move`

### Task 83.3 — Docs

- [ ] `docs/architecture.md`: courses (tables, job, public routes, clips).
- [ ] Update the AGENTS.md plan pointer.

Commit: `docs: courses and clips`

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
