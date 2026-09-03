/* global console, process */
//
// Prints puzzle recommendations for a diagnosis code, e.g. to hand a
// student real practice material for a weak spot the coach found. Reads
// apps/api/data/puzzle-index.csv (build it first with
// `npm run build-puzzle-index -- <path-to-lichess_db_puzzle.csv>`).
//
// Usage:
//   npm run select-puzzles -- MS-01 950 5
//   npm run select-puzzles -- TA-07 1500 3 --max-plies 2
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGNOSIS_CODE_PUZZLE_THEMES, selectPuzzles } from '@freechesscoach/chess-analysis';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(scriptDirectory, '../data/puzzle-index.csv');

const [code, ratingArg, countArg, ...rest] = process.argv.slice(2);
if (!code || !ratingArg) {
  console.error('usage: select-puzzles.mjs <diagnosisCode> <rating> [count] [--max-plies N]');
  console.error(`known codes: ${Object.keys(DIAGNOSIS_CODE_PUZZLE_THEMES).sort().join(', ')}`);
  process.exit(1);
}
const maxPliesFlagIndex = rest.indexOf('--max-plies');
const maxSolverPlies = maxPliesFlagIndex >= 0 ? Number(rest[maxPliesFlagIndex + 1]) : undefined;

const csv = await readFile(indexPath, 'utf8').catch(() => {
  console.error(`${indexPath} not found — build it first: npm run build-puzzle-index -- <path-to-lichess_db_puzzle.csv>`);
  process.exit(1);
});
const lines = csv.trim().split('\n');
const pool = lines.slice(1).map((line) => {
  const [puzzleId, fen, moves, rating, themes] = line.split(',');
  return { puzzleId, fen, moves: moves.split(' '), rating: Number(rating), themes: themes.split(' ') };
});

const results = selectPuzzles(pool, {
  code,
  rating: Number(ratingArg),
  count: countArg ? Number(countArg) : 5,
  maxSolverPlies
});

if (results.length === 0) {
  console.log(`No puzzles found for ${code}. Known codes: ${Object.keys(DIAGNOSIS_CODE_PUZZLE_THEMES).sort().join(', ')}`);
  process.exit(0);
}

for (const puzzle of results) {
  console.log(`${puzzle.puzzleId}  rating=${puzzle.rating}  https://lichess.org/training/${puzzle.puzzleId}`);
  console.log(`  fen: ${puzzle.fen}`);
  console.log(`  themes: ${puzzle.themes.join(', ')}`);
}
