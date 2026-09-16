#!/usr/bin/env node
// shared-engine-worker.ts's defaultCreateWorker() loads the browser WASM
// engine via `new URL('stockfish/bin/stockfish-18-single.{js,wasm}',
// import.meta.url)` — a literal, file-relative path Vite's static-asset
// analysis resolves against disk (both in dev, serving straight from src/,
// and at build time, when it copies+hashes the file into dist/assets). That
// path only works if the files actually exist under
// apps/web/src/engine/stockfish/bin/ — but the ~108MB .wasm has no business
// being committed to git, so this script stages both files there from the
// `stockfish` npm dependency (which already ships them, unhashed, under its
// own bin/) on every install/dev/build. Without this step the worker 404s
// (Vite serves the SPA's index.html for the missing path instead) and
// SharedEngineWorker's `onerror` fires immediately — silently collapsing
// every browser-engine feature (Explore panel, browser-mode tunnel
// fulfillment, and the engine-activity indicator's 'installing'/'searching'
// states) back to as if the engine were merely idle.
//
// Also stages the `-lite-single` pair (~7MB) for the second, lightweight
// worker (shared-engine-worker-instance.ts's getSharedLiteEngineWorker()) —
// used only to supplement candidate-move breadth and for exploratory JIT
// hints, never for the graded/official evaluation the full-net build above
// is reserved for.
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const stockfishPkgJson = require.resolve('stockfish/package.json');
const srcDir = join(dirname(stockfishPkgJson), 'bin');
const destDir = join(here, '..', 'src', 'engine', 'stockfish', 'bin');
const FILES = [
  'stockfish-18-single.js',
  'stockfish-18-single.wasm',
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm'
];

mkdirSync(destDir, { recursive: true });

for (const file of FILES) {
  const src = join(srcDir, file);
  const dest = join(destDir, file);
  if (!existsSync(src)) {
    throw new Error(`Missing ${src} — is the "stockfish" npm package installed?`);
  }
  copyFileSync(src, dest);
}

console.log(`copy-stockfish-assets: staged ${FILES.length} file(s) into ${destDir}`);
