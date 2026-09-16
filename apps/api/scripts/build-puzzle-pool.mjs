/* global console, process */
//
// Builds apps/api/data/puzzle-pool.bin — the in-memory pool
// apps/api/src/services/puzzle-pool.ts loads at process start, and
// packages/chess-analysis/src/puzzle-selection.ts's selectPuzzles picks
// homework puzzles from (see apps/api/scripts/select-puzzles.mjs for a CLI
// that queries it directly). A rating-spread sample across every theme
// packages/chess-analysis/src/puzzle-selection.ts's
// DIAGNOSIS_CODE_PUZZLE_THEMES maps our diagnosis codes to — see
// puzzle-pool-format.ts's PUZZLE_POOL_THEMES, imported here rather than
// duplicated, so the theme allowlist can't drift out of sync with the
// format that encodes it.
//
// A different, much smaller sample from the same source
// (packages/chess-analysis/data/lichess-puzzle-motifs.csv, built by
// packages/chess-analysis/scripts/build-lichess-puzzle-fixture.mjs) exists
// only to validate classifyTacticMotif and is committed to git; this one
// is a working dataset for real puzzle assignments and is not (see
// apps/api/data/README.md).
//
// Standalone, offline batch job, run by hand — see apps/api/data/README.md
// and docs/plan.md Task 59.1. Deploys onto the SAME PersistentVolumeClaim
// the Lichess evaluation index already uses (apps/api/scripts/deploy-
// lichess-eval-index.sh), as a second file alongside it — not a new volume.
//
// Usage:
//   curl -o /tmp/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
//   unzstd /tmp/lichess_db_puzzle.csv.zst
//   npm run build-puzzle-pool -- /tmp/lichess_db_puzzle.csv
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPuzzlePool, PUZZLE_POOL_THEMES } from '@freechesscoach/chess-analysis/puzzle-pool-format';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(scriptDirectory, '../data/puzzle-pool.bin');

const RATING_MIN = 400;
const RATING_MAX = 2400;
const RATING_BAND_SIZE = 200;
const POPULARITY_MIN = 50;
const PLAYS_MIN = 200;
// Well above build-puzzle-index.mjs's earlier 15/theme/band demo cap —
// this is meant to serve real, repeated assignments over a student's
// lifetime, not just prove the pipeline works.
const PER_THEME_PER_BAND = 120;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: build-puzzle-pool.mjs <path-to-lichess_db_puzzle.csv>');
  process.exit(1);
}

function ratingBand(rating) {
  return Math.floor((rating - RATING_MIN) / RATING_BAND_SIZE);
}

/** theme -> band index -> rows */
const pools = new Map(PUZZLE_POOL_THEMES.map((theme) => [theme, new Map()]));

const rl = readline.createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
let isFirstLine = true;
for await (const line of rl) {
  if (isFirstLine) {
    isFirstLine = false;
    continue;
  }
  const columns = line.split(',');
  const [puzzleId, fen, moves, ratingRaw, , popularityRaw, playsRaw, themesRaw] = columns;
  const rating = Number(ratingRaw);
  const popularity = Number(popularityRaw);
  const plays = Number(playsRaw);
  if (rating < RATING_MIN || rating > RATING_MAX) continue;
  if (popularity < POPULARITY_MIN || plays < PLAYS_MIN) continue;

  const themes = themesRaw.split(' ');
  const band = ratingBand(rating);
  for (const theme of themes) {
    const themePool = pools.get(theme);
    if (!themePool) continue;
    const bandRows = themePool.get(band) ?? [];
    if (bandRows.length < PER_THEME_PER_BAND) {
      bandRows.push({ puzzleId, fen, moves: moves.split(' '), rating, themes });
      themePool.set(band, bandRows);
    }
  }
}

const seen = new Map();
for (const [theme, bandMap] of pools) {
  let count = 0;
  for (const bandRows of bandMap.values()) {
    for (const row of bandRows) {
      if (!seen.has(row.puzzleId)) seen.set(row.puzzleId, row);
      count++;
    }
  }
  console.log(`${theme}: ${count} theme-tagged occurrences across ${bandMap.size} rating bands`);
}

const records = [...seen.values()];
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, packPuzzlePool(records));
console.log(`wrote ${records.length} unique puzzles to ${outputPath}`);
