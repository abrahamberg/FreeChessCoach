/* global console, process, fetch, URL */
/**
 * Records the API responses the public live demo (/demo) replays, from the two
 * seeded demo players, into apps/web/src/demo/fixtures.json. The demo never
 * talks to the real API: it answers `fetch('/api/...')` from this file.
 *
 *   npx tsx apps/api/scripts/seed-demo.ts     # once, to create the demo data
 *   node scripts/record-demo-fixtures.mjs     # dev stack (npm run dev) running
 *
 * Same requirements as capture-marketing-shots.mjs (global Playwright, Chrome).
 * See docs/marketing-demo.md.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(execSync('npm root -g').toString().trim(), '/'));
const { chromium } = require('playwright');

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src', 'demo', 'fixtures.json');
const CLIMBER = 'demo-year@local.test';
const BEGINNER = 'demo-week6@local.test';
const STATS_RANGES = ['last7', 'last30', 'last365', 'all'];
const STATS_SPEEDS = ['rapid', 'all'];
/** Only API paths a page reads are recorded; live streams and the engine tunnel are not. */
const SKIP = [/^\/api\/analyses\//, /^\/api\/engine-tunnel/, /^\/api\/tts\//];

async function api(email, path) {
  const response = await fetch(`${WEB}${path}`, { headers: { 'X-Forwarded-Email': email } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function statsFor(email) {
  const table = {};
  for (const range of STATS_RANGES) {
    for (const speed of STATS_SPEEDS) {
      const path = `/api/users/me/stats?range=${range}&speed=${speed}`;
      table[path] = await api(email, path);
    }
  }
  return table;
}

/** Visits `paths` as `email` and keeps every JSON `GET /api/...` the app made. */
async function crawl(browser, email, paths, { before, after } = {}) {
  const table = {};
  for (const path of paths) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'X-Forwarded-Email': email }, timezoneId: 'UTC', locale: 'en-US' });
    const page = await context.newPage();
    page.on('response', async (response) => {
      const url = new URL(response.url());
      const key = `${url.pathname}${url.search}`;
      if (!key.startsWith('/api/') || SKIP.some((pattern) => pattern.test(key))) return;
      if (response.request().method() !== 'GET' || response.status() !== 200) return;
      if (!(response.headers()['content-type'] ?? '').includes('json')) return;
      table[key] = await response.json().catch(() => undefined);
    });
    if (before) await before(page, path);
    await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    if (after) await after(page, path);
    await context.close();
  }
  return table;
}

/** The Lichess list would otherwise query the real Lichess API for the demo username. */
const LICHESS_GAMES = ['rook_lifter', 'sneaky_owl42', 'quietmonk', 'blitzfox7', 'happy_pawn', 'ironwolf', 'night_fox', 'castle_dancer'].flatMap((opponent, i) =>
  [0, 1].map((k) => ({
    id: `demo${i}${k}`,
    pgn: '[Event "Rated Rapid game"]\n\n1. e4 e5 *',
    whiteName: k === 0 ? 'sam_climbs' : opponent,
    blackName: k === 0 ? opponent : 'sam_climbs',
    result: (i + k) % 3 === 0 ? '0-1' : '1-0',
    timeControl: '600+0',
    playedAt: new Date(Date.now() - (i * 2 + k) * 3_600_000 - 3_600_000).toISOString()
  }))
);

/** Per-move engine dumps the review screens never read (all optional in the schema) — 88% of a game's size. */
const UNUSED_MOVE_FIELDS = ['features', 'checksCapturesThreats', 'featureDelta'];

function slimMoves(moves) {
  return moves?.map((move) => Object.fromEntries(Object.entries(move).filter(([key]) => !UNUSED_MOVE_FIELDS.includes(key))));
}

function slimGame(game) {
  return { ...game, classifiedMoves: slimMoves(game.classifiedMoves) ?? null, gameReport: game.gameReport && { ...game.gameReport, moves: slimMoves(game.gameReport.moves) } };
}

/** The demo library only lists games whose review was recorded, so every row opens. */
function trimLibrary(base, reviewedGames) {
  const key = '/api/games/imported?limit=15';
  base[key] = { items: base[key].items.filter((game) => reviewedGames.includes(game.id)), hasMore: false };
  for (const id of reviewedGames) base[`/api/games/${id}`] = slimGame(base[`/api/games/${id}`]);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });

const dashboard = await api(BEGINNER, '/api/users/me/dashboard');
const featured = dashboard.sessionHistory.find((entry) => entry.summary?.includes('Qxc1+'));
if (!featured) throw new Error('Featured lesson not found: has seed-demo.ts finished for the beginner?');
const reviewedGames = [...new Set(dashboard.sessionHistory.map((entry) => entry.gameId))];

const base = await crawl(
  browser,
  BEGINNER,
  ['/games', '/import', '/play', '/play/new', '/play-bot/new', '/progress', '/settings', `/session/${featured.sessionId}`, ...reviewedGames.map((id) => `/review/${id}`)],
  { before: (page) => page.route('**/api/lichess/recent-games', (route) => route.fulfill({ json: LICHESS_GAMES })) }
);
base['/api/lichess/recent-games'] = LICHESS_GAMES;
trimLibrary(base, reviewedGames);
// Practice puzzles need their own recorded data and a puzzle coach; the demo leaves them out.
base['/api/puzzle-assignments'] = [];
Object.assign(base, await statsFor(BEGINNER));
const oneYear = await statsFor(CLIMBER);
await browser.close();

const fixtures = { recordedAt: new Date().toISOString(), sessionId: featured.sessionId, base, oneYear };
writeFileSync(OUT, `${JSON.stringify(fixtures)}\n`);
const kb = (value) => `${Math.round(JSON.stringify(value).length / 1024)} KB`;
console.log(`wrote ${OUT}: base ${Object.keys(base).length} responses (${kb(base)}), oneYear ${Object.keys(oneYear).length} (${kb(oneYear)})`);
for (const [key, value] of Object.entries(base).sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length).slice(0, 12)) console.log(' ', kb(value), key);
