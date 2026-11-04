# FreeChessCoach — The studio split (Phases 134–139)

Written 2026-11-04. The plan before this one (the content studio inside the
app, Phases 130–132) is in git history (`git show ad36b61:docs/plan.md`); its
work is either kept below or moved out. Phase numbers continue from 133.

## Why (the owner, 2026-11-04)

Course making was spread over three places: the app's "Write with AI" writer,
studio pages and in-browser video recorder; a studio CLI in the app's
scripts; and the channel runner's folder (`../chess-content-studio`), which
mixed Claude's instructions and state with tools that imported the app's
internals. Courses belonged to one user each. Production writes went through
a snippet pasted into a signed-in tab, and the app took a dossier from the
client.

FreeChessCoach stays the open-source chess platform: every feature it has
(games, Game Review, the coach, diagnostics, puzzles, TTS, …) is untouched.
Only the studio role leaves it.

## Who owns what

| Folder | Owns | Never |
|---|---|---|
| `freechesscoach` (this repo) | The course schema (learner content only), the import guard (PGN → tree, the dossier on the app's own engine, the verifier, publish blockers), course editors and tokens, publishing, the learner side, note audio storage, the coaches (personas, voices, avatars), all chess code the review or the guard uses | Course writing, prompts for it, video or reel code, posting, channel analytics |
| `../studio` (new, private) | Every tool that makes content: research (explore, gaps), the skeleton, video and reel text and their checks, the renderer (headless, MP4 out), note audio (Kokoro in Node), thumbnails, compilations, YouTube upload, analytics, the channel state helpers. A CLI with JSON output | Copying app code: it imports the app's source by relative path, through one file (`src/app.ts`) |
| `../chess-content-generator` (was `chess-content-studio`) | Claude's instructions (`CLAUDE.md`, playbooks, agents) and the channel's state (briefs, courses, videos, logs, research) | Code |

The three folders always sit side by side (owner, 2026-11-04): no npm
packages between them. Rule for anything in between: the app needs it to
accept, check or show a course → the app owns it and the studio imports it;
used only to make content → the studio.

## Phases

### Phase 134 — The app: editors, tokens, the guard, no AI writer

Status: done 2026-11-04 (this commit).

- [x] `0032_course_editors.ts`: `can_create_courses` → `can_edit_courses`;
      `owner_id` → `created_by` (nullable, set null when the account goes);
      `course_api_tokens`; drops `course_ai_calls`, `courses.generation`,
      `courses.evals`. Every editor sees and edits every course; members-only
      courses open for editors; a series is the platform's.
- [x] Bearer tokens on `/api/token/*` only (`plugins/auth-headers.ts`),
      made and revoked on `/api/course-tokens` (session only); oauth2-proxy
      skips auth for `^/api/token/` (chart, compose, `deploy/helm/test.sh`).
      Threat model T14.
- [x] `PUT /api/courses/import`: the app parses the PGN (`course-source.ts`),
      refuses moves that differ, builds the dossier itself
      (`course-import.ts`); `PATCH /api/courses/:id` (status, access level,
      clip links). Removed: create from intake, skeleton, draft, document,
      analyze, generate, reel, regenerate, debug, and the worker job.
- [x] Learner-only `CourseDocument`: no `video`, `reel`, `videos`,
      `hookOptions`, budgets, `say`, `caption`, `playOut`. The verifier
      checks the course's own text (`verify.ts`, `verify-voice.ts`); its
      parts stay exported for the studio's video checks.
- [x] Out of the app: course prompts (but Ask my coach), the writer, the
      manual episodes, the intake, `scripts/course-studio/*`, the
      generation-only chess code (skeleton, reel candidates, gaps, key moves,
      quiz cuts, own moves, outline check, the reel's checks), the web
      studio pages and `clip/*`. Git history keeps them for the studio.
- [x] Web: `/manage/courses` and `/manage/courses/:id` (list, checks,
      learner preview with the uploaded audio, publish, visibility, posted
      videos, tokens).
- [x] Golden facts snapshot kept, on app code only (the dossier and review
      notes; the reel candidates and plan left with the studio). Re-recorded:
      only those sections removed, every fact byte-identical.

### Phase 135 — The studio repo, course side

- [ ] `~/projects/studio`: `src/app.ts` (the only import of `../freechesscoach`),
      `src/cli.ts`, `src/platform/` (the token client), `src/course/`
      (explore, gaps, skeleton and template episodes, intake → document,
      check = the app's dossier + `draftCheckProblems`, push = import,
      publish, pull, `export-all`). Docs: the making sections that left
      `docs/courses.md` (`docs/course-making.md`).
- [ ] Check: `export-all` writes every production course; `check` on each
      gives production's publish-check problems.

### Phase 136 — The studio, media and channel

- [ ] Renderer from git history (`apps/web/src/features/courses/clip/`):
      headless Chromium on a stepped clock → ffmpeg → MP4; `theme.ts` and a
      template per format; `preview`. Kokoro audio in Node, uploaded per
      note with `NOTE_PARAGRAPH_PAUSE_S`. Video text in `<slug>.clips.json`
      (the studio's schema) with the video checks on the app's exported
      verifier parts. The Python tools ported; YouTube upload.
- [ ] Check: one live course renders a reel and a video; `audio` leaves
      `missingNoteAudio` empty; one new course goes brief → push → publish →
      render → upload with no signed-in tab.

### Phase 137 — chess-content-generator

- [ ] Rename `../chess-content-studio`; remove `tools/`, the committed `.env`
      and `node_modules`; rewrite `CLAUDE.md` and the playbooks around the
      studio's commands; deny edits to `../studio` and `../freechesscoach`;
      copy the Claude memory to the new folder's key.

### Phase 138 — Deploy and check production

- [ ] Deploy; grant the owner `can_edit_courses` (migration renames the
      flag, so it carries over); make a token; every live `/learn/<slug>`
      answers, plays audio, keeps progress; one import and publish from the
      studio.

### Phase 139 — The app's history rewritten

After Phase 138 has run a week with no rollback: a mirror backup
(`~/backups/freechesscoach-2026-11-04.git` exists), an orphan root commit of
the tree, force-push `main`, delete the other remote branches and old tags,
tag the new root with the current release number (`../kube/scripts/deploy.py`
counts on it), transfer `studio-order` issues about the writer or renderer to
the studio repo. Check: a fresh clone builds and passes `npm run verify`.

## Where it stands

Phase 134 done. Until Phase 137, `../chess-content-studio/tools/course.sh`
is broken (it imported the app's writer, which is gone) and the channel
runner cannot make a course; the live courses are untouched.
