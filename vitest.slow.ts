/**
 * The slow tier: files named `*.slow.*` (build-game-report.slow.test.ts,
 * generation.slow.db.test.ts) drive the engine, hash, or take several seconds.
 * The default run (npm test, CI) skips them; run them on demand with
 * `npm run test:slow` when working on what they cover.
 */
export const slowExclude = process.env.RUN_SLOW_TESTS === 'true' ? [] : ['**/*.slow.*'];
