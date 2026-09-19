/* global console, process, fetch */
/**
 * Captures the marketing screenshots (apps/web/public/shots/*.png) from the
 * running dev stack, signed in as the two demo users that
 * `apps/api/scripts/seed-demo.ts` creates. No real data is on screen: the API
 * accepts the demo email in an `X-Forwarded-Email` header (AUTH_MODE=dev-stub).
 *
 *   npx tsx apps/api/scripts/seed-demo.ts        # once, to create the demo data
 *   node scripts/capture-marketing-shots.mjs     # dev stack (npm run dev) running
 *
 * Needs Playwright and a Chrome/Chromium binary: it resolves `playwright` from
 * the global npm root (it is not a project dependency) and uses CHROME_PATH or
 * /usr/bin/google-chrome. See docs/marketing-demo.md.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(execSync('npm root -g').toString().trim(), '/'));
const { chromium } = require('playwright');

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'shots');
const CLIMBER = 'demo-year@local.test';
const BEGINNER = 'demo-week6@local.test';
const VIEWPORT = { width: 1440, height: 900 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });

/** `tall` opens a very tall window: the app scrolls inside its own container, so
 * region shots of anything below the fold need the whole page in view. */
async function open(email, path, { before, tall = false } = {}) {
  const context = await browser.newContext({ viewport: tall ? { width: VIEWPORT.width, height: tall === true ? 2600 : tall } : VIEWPORT, extraHTTPHeaders: { 'X-Forwarded-Email': email }, timezoneId: 'UTC', locale: 'en-US' });
  const page = await context.newPage();
  if (before) await before(page);
  await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { page, close: () => context.close() };
}

async function api(email, path) {
  const response = await fetch(`${WEB}${path}`, { headers: { 'X-Forwarded-Email': email } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

/** Screenshot of the smallest box holding all the given locators, padded a little. */
async function shootRegion(page, name, locators, { pad = 16, maxHeight = Infinity } = {}) {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x, y, width: right - x, height: Math.min(bottom - y, maxHeight) } });
  console.log('wrote', name);
}

async function shootViewport(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('wrote', name);
}

const section = (page, label) => page.locator(`section[aria-label="${label}"]`);

/** The Lichess list would otherwise query the real Lichess API for the demo username. */
async function stubLichessGames(page) {
  const opponents = ['rook_lifter', 'sneaky_owl42', 'quietmonk', 'blitzfox7', 'happy_pawn', 'ironwolf', 'night_fox', 'castle_dancer'];
  const games = opponents.flatMap((opponent, i) => [0, 1].map((k) => ({
    id: `demo${i}${k}`,
    pgn: '[Event "Rated Rapid game"]\n\n1. e4 e5 *',
    whiteName: k === 0 ? 'sam_climbs' : opponent,
    blackName: k === 0 ? opponent : 'sam_climbs',
    result: (i + k) % 3 === 0 ? '0-1' : '1-0',
    timeControl: '600+0',
    playedAt: new Date(Date.now() - (i * 2 + k) * 3_600_000 - 3_600_000).toISOString()
  })));
  await page.route('**/api/lichess/recent-games', (route) => route.fulfill({ json: games }));
}

// ---- The year-long climber: Stats -------------------------------------------------
{
  const { page: heroPage, close: closeHero } = await open(CLIMBER, '/stats');
  await shootViewport(heroPage, 'hero-stats');
  await closeHero();
  const { page, close } = await open(CLIMBER, '/stats', { tall: true });
  await shootRegion(page, 'stats-rating', [section(page, 'Estimated rating')]);
  await shootRegion(page, 'stats-openings-tactics', [section(page, 'Opening'), section(page, 'Tactics')]);
  await shootRegion(page, 'stats-strategy-endgame', [section(page, 'Strategy'), section(page, 'Endgame')]);
  await close();
}

// ---- The six-weeks-in beginner: everything else ----------------------------------
const dashboard = await api(BEGINNER, '/api/users/me/dashboard');
const featured = dashboard.sessionHistory.find((entry) => entry.summary?.includes('Qxc1+'));
if (!featured) throw new Error('Featured lesson not found: has seed-demo.ts finished for the beginner?');

{
  const { page, close } = await open(BEGINNER, '/import', { before: stubLichessGames });
  await page.getByRole('button', { name: /lichess/i }).first().click();
  await page.waitForTimeout(1200);
  await shootViewport(page, 'import');
  await close();
}
{
  const { page, close } = await open(BEGINNER, '/games');
  await shootViewport(page, 'games-library');
  await close();
}
{
  const { page, close } = await open(BEGINNER, `/review/${featured.gameId}`);
  // 37...Ng5 (ply 74): the move where a winning game was thrown away.
  for (let ply = 0; ply < 74; ply++) await page.getByRole('button', { name: 'next move' }).click();
  await page.waitForTimeout(1500);
  await shootViewport(page, 'review');
  await close();
}
{
  const { page, close } = await open(BEGINNER, `/session/${featured.sessionId}`, { tall: 1250 });
  await page.getByText(/Their queen attacks my rook/).first().evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  await shootViewport(page, 'coach-session');
  await close();
}
{
  const { page: focusPage, close: closeFocus } = await open(BEGINNER, '/progress');
  await shootViewport(focusPage, 'progress-focus');
  await closeFocus();
  const { page, close } = await open(BEGINNER, '/progress', { tall: true });
  await shootRegion(page, 'progress-lessons', [section(page, 'Mistake trends'), section(page, 'Session history')], { maxHeight: 900 });
  await close();
}
{
  const { page, close } = await open(BEGINNER, '/play-bot/new');
  await shootViewport(page, 'bots');
  await close();
}
{
  // The start screen is short; crop to it rather than showing an empty page.
  const { page, close } = await open(BEGINNER, '/play/new');
  await shootRegion(page, 'play-coach', [page.locator('.play-start-page')]);
  await close();
}
{
  const { page, close } = await open(BEGINNER, '/settings', { tall: true });
  await shootRegion(page, 'settings-ai', [page.getByRole('heading', { name: 'AI setup' }).locator('xpath=..')]);
  await close();
}

// ---- Social preview (1200x630), built from the hero screenshot ----------------------
{
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await context.newPage();
  const hero = readFileSync(join(OUT, 'hero-stats.png')).toString('base64');
  const logo = readFileSync(join(OUT, '..', 'brand', 'logo.png')).toString('base64');
  await page.setContent(`<body style="margin:0;background:#faf9f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#26241e;display:flex;height:630px;overflow:hidden">
    <div style="flex:0 0 520px;padding:64px 0 0 64px;box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:12px;font-size:26px;font-weight:600"><img src="data:image/png;base64,${logo}" width="40" height="40">FreeChessCoach</div>
      <h1 style="font-size:52px;line-height:1.1;margin:44px 0 20px;font-weight:700">A chess coach that reads your games.</h1>
      <p style="font-size:26px;color:#6f6a5e;margin:0">Free. Bring your own AI key.</p>
    </div>
    <div style="flex:1;padding:72px 0 0 0"><img src="data:image/png;base64,${hero}" style="width:900px;border-radius:14px 0 0 0;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 30px rgba(0,0,0,.15)"></div>
  </body>`);
  await page.screenshot({ path: join(OUT, 'og.png') });
  console.log('wrote og');
  await context.close();
}

await browser.close();
