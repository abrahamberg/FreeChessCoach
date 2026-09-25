# Marketing pages, demo data and screenshots

The public pages (`apps/web/public/`: `landing.html`, `tour.html`, `guide.html`,
`keys.html`, `openai-key.html`, plus `site.css` and `shots/`) let people look around
before signing in. Everything on them is sample data from a made-up player, "Sam".

## Public routes

Served by `docker/nginx.web.conf` (exact-match locations, like `/privacy`) and let
through oauth2-proxy by `--skip-auth-route` entries in
`deploy/helm/freechesscoach/values.yaml` (`values.example.yaml` mirrors them;
`deploy/helm/test.sh` asserts them). A new public page needs all three.

| Path | File |
|---|---|
| `/` | `landing.html` |
| `/tour` | `tour.html` |
| `/guide` | `guide.html` |
| `/keys` | `keys.html` (how BYOK keys are handled, what is not promised) |
| `/openai-key` | `openai-key.html` (OpenAI account → project → data sharing → hard limit → key → Settings walkthrough; mirrored by the in-app welcome flow's AI step) |
| `/demo`, `/demo/*` | the live demo (see below); served by nginx's SPA fallback, so no nginx entry |
| `/site.css`, `/shots/*`, `/sitemap.xml` | assets |
| `/assets/*` | the SPA's hashed bundle, public because the demo runs from it |

The claims on `keys.html` are checked against code: encryption is
`apps/api/src/llm/key-vault.ts` (AES-256-GCM, scrypt-derived from the user's
phrase, no server master key), the unlock cache and its sliding TTL (default 900 s,
`LLM_UNLOCK_TTL_SECONDS`) are `apps/api/src/llm/unlock-store.ts`. Re-check those
files before changing the page.

Step 10 of `guide.html` (`#voice`, the local Kokoro voice server) is checked
against Kokoro-FastAPI's own README and start scripts, not this repo: image
`ghcr.io/remsky/kokoro-fastapi-cpu` (about 5 GB), default port 8880, `PORT`
honored by the Mac/Linux scripts but hard-coded in `start-cpu.ps1`. The app side
is `apps/web/src/features/settings/LocalVoiceSetup.tsx`, which links to it.

`openai-key.html` carries two screenshots of OpenAI's own console
(`shots/openai-sharing.png`, `openai-api-key-*.png`, `openai-projects.jpg`, `openai-project-limits.jpg`), taken on
2026-09-24 from a throwaway OpenAI account made for this, with the owner's explicit
go-ahead. The API-key reveal deliberately shows a real key (the owner asked for it, so readers see what one looks like); that key was deleted afterwards. Nothing shows an email or project id. The account has no billing, so the
project's monthly budget and **Enforce hard limit** controls were **not** seen
and are described from the owner's instruction only, with the page saying so.
Retake them if OpenAI's console changes.

## The live demo (`/demo`)

The real SPA, running at `/demo/*` on **recorded sample data**. Nothing reaches the API,
so opening it up needs no server change and exposes no endpoint. The whole thing is
`apps/web/src/demo/`:

- `main.tsx` calls `installDemo()` when the path starts with `/demo`. It loads
  `fixtures.json` (its own lazy chunk, about 285 KB gzipped, so normal users never
  download it), shifts every timestamp forward by the whole days since recording
  (`rebaseDates.ts`, so "lesson 4 days ago" stays true), and replaces `window.fetch`
  with `createDemoFetch` (`demoFetch.ts`).
- The fake `fetch` answers `GET /api/...` from the fixtures, answers an unrecorded GET
  with a 404, **refuses every other write with 403** and a "read-only demo" message
  (shown in the banner by `onRefused`), and passes non-`/api` requests through. It
  never calls the real network for `/api`. `EventSource` is stubbed, the engine tunnel
  and service worker are not started, and the router runs with `basename="/demo"`.
- **The coach is scripted, with no model.** The recorded coach session is cut at the
  first thing the student typed (`conversationScript.ts`). Everything before it is
  history; each later student line is offered in the composer (`DemoComposer.tsx`,
  read-only, so it cannot be edited). Pressing send goes through the app's real chat
  code: the thinking dots show, then the next recorded coach reply streams back as the
  same Server-Sent Events the server sends (`scriptedStream.ts`), including the
  `show_position` tool call that moves the board (a client tool, so it ends a stream
  and continues in the next POST, as live). The next line appears only once the reply
  has finished (`demoConversation.ts`). While it is in progress the session looks
  active, with no summary or homework, and the board follows the last position shown.
- `DemoBanner.tsx` is the notice bar. On Stats it switches between the two sample
  players: Sam six weeks in (about 830, all pages) and Sam a year in (2130, Stats only).
- `/demo/coach` redirects to the coach session, so public pages can link to it without
  knowing the session id.

Recording and refreshing the fixtures:

```sh
npx tsx apps/api/scripts/seed-demo.ts all      # once, if the demo users do not exist
node scripts/record-demo-fixtures.mjs          # dev stack running; rewrites fixtures.json
```

The recorder visits each page as the demo users, keeps every JSON `GET /api/...`, drops
the per-move engine dumps the review screens never read (`features`,
`checksCapturesThreats`, `featureDelta`: 88% of a game's size), trims the library to the
games whose review was recorded, and leaves the practice cards out (puzzle sessions
would need their own data and a puzzle coach). To add a page to the demo, add its path
to the crawl list in that script. Re-record after any change to the seeded data or to a
response schema, and commit `fixtures.json`.

Limits, on purpose: only recorded games open, practice sets are not in the demo, and
playing a bot or the coach (which needs an engine) is refused with the notice.

## Demo data

`apps/api/scripts/seed-demo.ts` writes two demo users into the **dev** database,
under their own emails (`demo-year@local.test`, `demo-week6@local.test`), so real
dev data is never touched. Re-running replaces them; `--remove` deletes them.

```sh
npm run dev                                   # dev stack (api + worker + engine)
PUZZLE_POOL_PATH=$PWD/apps/api/data/puzzle-pool.bin \
  npx tsx apps/api/scripts/seed-demo.ts       # ~10 min: the beginner's games are analysed by the real engine
```

| User | What it is |
|---|---|
| `climber` | 3,420 rapid games over a year, rating 450 → 2130. The oldest 2,450 are banked in `stats_archive_weeks` exactly as the app would after the 1,000-game library cap; the newest 970 are live, analysed rows. |
| `beginner` | Six weeks in, rated in the 800s. 250 shallow games, plus 5 fixture games in `apps/api/scripts/demo/games/` imported through the real API (real Stockfish analysis). Eight completed lessons with dates, summaries and homework, the coach's focus areas and measured diagnoses, mistake trends, real Lichess practice puzzles, and one full coaching conversation. |

Design notes:

- **Everything is seeded and repeatable** (`mulberry32`); pure generators live in
  `apps/api/scripts/demo/` with tests (`npx vitest run apps/api/scripts/demo`).
- **The rating curve** (`rating-curve.ts`) is fast to 1000, slower to 1600, then a
  long grind with a plateau and a small setback. The test pins the three stage slopes.
- **Diagnoses are real catalog codes**, described as mechanisms, not symptoms
  (`beginner-diagnoses.test.ts` checks them against `DIAGNOSIS_CODES_BY_ID`).
- **Lesson text about real games is written from the engine's own findings** (missed
  `Qxc1+` on move 32, no recapture `Rxd2+` on move 37). Re-analysis with a different
  engine version can change those; re-read the lessons if the fixtures are regenerated
  (`generate-beginner-games.mjs`).
- **Dates are relative to the day you seed**, so a fresh run is never stale.
- The seeded shallow games stop after the opening: they exist for the lists, stats
  and archive, not for review. Only the fixture games open in Game Review.

## Screenshots

```sh
node scripts/capture-marketing-shots.mjs      # dev stack running, demo data seeded
```

Writes `apps/web/public/shots/*.png`. It signs in as the demo users through the
`X-Forwarded-Email` header (`AUTH_MODE=dev-stub`), stubs the Lichess request so the
demo username never reaches the real Lichess, and needs Playwright (resolved from the
global npm root; not a project dependency) and Chrome (`CHROME_PATH`).

Rules for anything published here:

- Never screenshot a real account (this app's or a third party's). The OpenAI
  walkthrough is text-only for that reason.
- Label demo figures as sample data, and never imply Sam's year is a promise.

## The rating chart

The Stats rating chart places points by the date each game was played
(`ratingChartScale.ts`'s `xForTime`), not by their position in the list. Once the
library cap archives old games into one point per week, an evenly spaced axis
squeezed a whole year of climbing into the first few percent of the chart.
