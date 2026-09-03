/* global console, process */
//
// Builds apps/api/data/puzzle-index.csv — a compact, rating-spread sample
// of real Lichess puzzles across the themes
// packages/chess-analysis/src/puzzle-selection.ts's
// DIAGNOSIS_CODE_PUZZLE_THEMES maps our diagnosis codes to. This is the
// pool `selectPuzzles()` picks homework/training puzzles from (see
// apps/api/scripts/select-puzzles.mjs for a CLI that queries it) — a
// broader, coarser-filtered sample than
// packages/chess-analysis/data/lichess-puzzle-motifs.csv, which exists
// only to validate classifyTacticMotif and is deliberately small.
//
// Standalone, offline batch job, run by hand — see apps/api/data/README.md.
// Not yet wired into any deploy pipeline: for now this is a local/dev tool
// (see select-puzzles.mjs), not a served production dataset.
//
// Usage:
//   curl -o /tmp/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
//   unzstd /tmp/lichess_db_puzzle.csv.zst
//   npm run build-puzzle-index -- /tmp/lichess_db_puzzle.csv
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(scriptDirectory, '../data/puzzle-index.csv');

// Every Lichess theme any DIAGNOSIS_CODE_PUZZLE_THEMES entry references —
// keep in sync with packages/chess-analysis/src/puzzle-selection.ts.
const TARGET_THEMES = new Set([
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'mateIn4',
  'mateIn5',
  'backRankMate',
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'doubleCheck',
  'capturingDefender',
  'deflection',
  'trappedPiece',
  'hangingPiece',
  'exposedKing',
  'discoveredCheck',
  'promotion',
  'quietMove',
  'defensiveMove',
  'zugzwang',
  'intermezzo',
  'attraction'
]);

const RATING_MIN = 400;
const RATING_MAX = 2400;
const RATING_BAND_SIZE = 200;
const POPULARITY_MIN = 50;
const PLAYS_MIN = 200;
const PER_THEME_PER_BAND = 15;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: build-puzzle-index.mjs <path-to-lichess_db_puzzle.csv>');
  process.exit(1);
}

function ratingBand(rating) {
  return Math.floor((rating - RATING_MIN) / RATING_BAND_SIZE);
}

/** theme -> band index -> rows */
const pools = new Map([...TARGET_THEMES].map((theme) => [theme, new Map()]));

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
      bandRows.push({ puzzleId, fen, moves, rating, themes: themesRaw });
      themePool.set(band, bandRows);
    }
  }
}

const rows = ['puzzleId,fen,moves,rating,themes'];
const seen = new Set();
let totalPerTheme = 0;
for (const [theme, bandMap] of pools) {
  let count = 0;
  for (const bandRows of bandMap.values()) {
    for (const row of bandRows) {
      if (seen.has(row.puzzleId)) continue;
      seen.add(row.puzzleId);
      rows.push(`${row.puzzleId},${row.fen},${row.moves},${row.rating},${row.themes}`);
      count++;
    }
  }
  console.log(`${theme}: ${count} puzzles across ${bandMap.size} rating bands`);
  totalPerTheme += count;
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} unique puzzles (${totalPerTheme} theme-tagged occurrences) to ${outputPath}`);
