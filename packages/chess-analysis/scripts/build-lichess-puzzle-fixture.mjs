/* global console, process */
//
// Builds data/lichess-puzzle-motifs.csv — a small, deterministic sample of
// real Lichess puzzles, independently theme-tagged by Lichess's own
// community/generator, used by
// src/tactic-detectors/lichess-puzzle-validation.test.ts as ground truth
// for classifyTacticMotif. The point is a validation source that wasn't
// authored with the same mental model as the detectors themselves (unlike
// this package's other hand-crafted synthetic-FEN unit tests).
//
// This is a standalone, offline batch job you run by hand against a
// downloaded snapshot of https://database.lichess.org/#puzzles — never
// wired into CI or app deploys. The output fixture IS committed (it's a few
// hundred rows); the multi-GB source CSV is not.
//
// Usage:
//   curl -o /tmp/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
//   unzstd /tmp/lichess_db_puzzle.csv.zst
//   npx tsx scripts/build-lichess-puzzle-fixture.mjs /tmp/lichess_db_puzzle.csv
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(scriptDirectory, '../data/lichess-puzzle-motifs.csv');

// Lichess puzzle theme -> the TacticMotifType it's expected to make
// classifyTacticMotif return, on at least one of the puzzle's solving
// plies. Deliberately excludes 'backRankMate': that theme is almost always
// itself a forced mate, and classify-tactic-motif.ts's `isCheckmate` check
// runs before the tactic-detector registry, so a mating move is always
// classified 'checkmate' regardless of what pattern delivers it — there is
// no way for a puzzle tagged 'backRankMate' to ever come back 'weakBackRank'
// through this method. Also excludes 'overloadedDefender': no Lichess theme
// corresponds to it.
const THEME_TO_MOTIF = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discoveredAttack',
  doubleCheck: 'doubleCheck',
  trappedPiece: 'trappedPiece',
  hangingPiece: 'freePiece',
  capturingDefender: 'removesDefender',
  mateIn1: 'checkmate'
};

const RATING_MIN = 1000;
const RATING_MAX = 2200;
const POPULARITY_MIN = 70;
const PLAYS_MIN = 500;
const SAMPLE_SIZE = 40;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: build-lichess-puzzle-fixture.mjs <path-to-lichess_db_puzzle.csv>');
  process.exit(1);
}

/** @type {Record<string, string[]>} theme -> raw CSV data rows (post-header, sans the theme column repeat) */
const pools = Object.fromEntries(Object.keys(THEME_TO_MOTIF).map((theme) => [theme, []]));

const rl = readline.createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
let isFirstLine = true;
for await (const line of rl) {
  if (isFirstLine) {
    isFirstLine = false;
    continue;
  }
  const columns = line.split(',');
  const [, , , ratingRaw, , popularityRaw, playsRaw, themesRaw] = columns;
  const rating = Number(ratingRaw);
  const popularity = Number(popularityRaw);
  const plays = Number(playsRaw);
  if (rating < RATING_MIN || rating > RATING_MAX) continue;
  if (popularity < POPULARITY_MIN || plays < PLAYS_MIN) continue;

  const themes = ` ${themesRaw} `;
  const isMate = / (mate|mateIn[1-5]) /.test(themes);
  const isLong = / (long|veryLong) /.test(themes);
  if (isLong) continue;

  let target = null;
  for (const theme of Object.keys(THEME_TO_MOTIF)) {
    if (theme === 'mateIn1') continue; // checked last, deliberately not excluded by isMate
    if (!isMate && themes.includes(` ${theme} `)) {
      target = theme;
      break;
    }
  }
  if (!target && themes.includes(' mateIn1 ')) target = 'mateIn1';
  if (!target) continue;

  pools[target].push(line);
}

const rows = ['target,motif,PuzzleId,FEN,Moves,Rating,Popularity,NbPlays,Themes'];
for (const [theme, motif] of Object.entries(THEME_TO_MOTIF)) {
  const pool = pools[theme];
  const stride = Math.max(1, Math.floor(pool.length / SAMPLE_SIZE));
  let sampled = 0;
  for (let i = 0; i < pool.length && sampled < SAMPLE_SIZE; i += stride) {
    rows.push(`${theme},${motif},${pool[i]}`);
    sampled++;
  }
  console.log(`${theme}: pool ${pool.length}, sampled ${sampled}`);
}

await writeFile(outputPath, rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} rows to ${outputPath}`);
