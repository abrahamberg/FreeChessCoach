import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePgn } from '@freechesscoach/chess-analysis';
import { loadGoldenSet } from '../../test/fixtures/courses/golden-set.js';
import { paths, readJsonl, unitHash, writeJsonl } from './store.js';

/** One game (or golden course) the audit reads. `split` keeps a held-out
 * fifth that fixes are never tuned on; `readerSide` is whose review it is. */
export interface CorpusGame {
  id: string;
  source: 'lichess' | 'seed' | 'golden' | 'db';
  band: string;
  split: 'dev' | 'holdout';
  readerSide: 'white' | 'black';
  pgn: string;
  /** The puzzle's first solver ply, when the game came from a puzzle. */
  focusPly: number | null;
  /** The evals the game was analysed with (a JSON array of EngineEval),
   * replayed instead of a fresh search: an owner's report only reproduces
   * with the engine answers it was made from. */
  evalsFile: string | null;
  note?: string;
  /** What the owner expected to read on a move of a seed: some sentence of
   * the review's move at `ply` has to contain `says`. */
  expect?: SeedExpectation[];
}

export interface SeedExpectation {
  ply: number;
  says: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const PUZZLE_FIXTURE = path.join(here, '../../../../packages/chess-analysis/data/lichess-puzzle-motifs.csv');
const PUZZLE_DB_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const DUMP_LIST_URL = 'https://database.lichess.org/standard/list.txt';
const BANDS: [number, string][] = [
  [1000, '<1000'],
  [1400, '1000-1399'],
  [1800, '1400-1799'],
  [2200, '1800-2199'],
  [Infinity, '2200+']
];
const GAME_URL = /lichess\.org\/(\w{8})(?:\/(?:white|black))?#(\d+)/;
/** Puzzle batches with no new game before the puzzle source gives up on the bands still short. */
const IDLE_BATCHES = 3;
/** Dump games with less base time than this (bullet) are skipped: few people review them. */
const MIN_BASE_SECONDS = 180;

export interface CorpusOptions {
  perBand: number;
  /** Puzzle rows streamed from the full Lichess puzzle DB (0: only the repo's 360-row fixture). */
  stream: number;
  /** PGN lines streamed from the newest Lichess monthly dump (0: none). About 20 lines a game. */
  dump: number;
}

/** Real Lichess games bucketed by the players' average rating, plus the
 * seeds and golden courses. Two sources: games found through puzzles (each
 * has a tactic somewhere; none is rated under 1400) and, with `dump`, the
 * head of the monthly dump (any game, every band). With both, puzzles fill
 * at most half a band. Saved after every batch: a failed fetch keeps the rest. */
export async function buildCorpus(options: CorpusOptions): Promise<CorpusGame[]> {
  const existing = new Map(readJsonl<CorpusGame>(paths.corpus).map((game) => [game.id, game]));
  for (const game of [...seedGames(), ...goldenGames()]) existing.set(game.id, game);
  const lichess = (): CorpusGame[] => [...existing.values()].filter((game) => game.source === 'lichess');
  const count = (games: CorpusGame[]): Map<string, number> => new Map(BANDS.map(([, band]) => [band, games.filter((game) => game.band === band).length]));
  const save = (label: string): void => {
    writeJsonl(paths.corpus, [...existing.values()]);
    console.log(`corpus (${label}): ${[...count(lichess())].map(([band, total]) => `${band} ${total}`).join(', ')}`);
  };

  const puzzleTarget = options.dump > 0 ? Math.ceil(options.perBand / 2) : options.perBand;
  const fromPuzzles = count(lichess().filter((game) => game.focusPly !== null));
  if (!bandsFull(fromPuzzles, puzzleTarget)) {
    const focus = puzzleGameIds(options.stream);
    const wanted = [...focus.keys()].filter((id) => !existing.has(id));
    for (let start = 0, idle = 0; start < wanted.length && idle < IDLE_BATCHES && !bandsFull(fromPuzzles, puzzleTarget); start += 300) {
      const added = addGames(existing, fromPuzzles, puzzleTarget, (await exportGames(wanted.slice(start, start + 300))).map((pgn) => lichessGame(pgn, focus)));
      idle = added > 0 ? 0 : idle + 1;
      save('puzzles');
    }
  }

  const all = count(lichess());
  if (options.dump > 0 && !bandsFull(all, options.perBand)) {
    addGames(existing, all, options.perBand, dumpGames(options.dump).filter((game) => !existing.has(game.id)));
    save('dump');
  }
  const games = [...existing.values()];
  writeJsonl(paths.corpus, games);
  return games;
}

/** Adds the games whose band is still short; returns how many. */
function addGames(existing: Map<string, CorpusGame>, perBand: Map<string, number>, target: number, games: (CorpusGame | null)[]): number {
  let added = 0;
  for (const game of games) {
    if (!game || (perBand.get(game.band) ?? 0) >= target) continue;
    perBand.set(game.band, (perBand.get(game.band) ?? 0) + 1);
    existing.set(game.id, game);
    added += 1;
  }
  return added;
}

function bandsFull(perBand: Map<string, number>, target: number): boolean {
  return BANDS.every(([, band]) => (perBand.get(band) ?? 0) >= target);
}

/** Game id → the puzzle's ply in it. */
function puzzleGameIds(stream: number): Map<string, number> {
  const fixture = readFileSync(PUZZLE_FIXTURE, 'utf8').split('\n');
  const streamed = stream > 0 ? execSync(`curl -sL ${PUZZLE_DB_URL} | zstd -dc 2>/dev/null | head -n ${stream}`, { maxBuffer: 1 << 30, shell: '/bin/bash' }).toString().split('\n') : [];
  const rows = fixture.concat(streamed);
  const ids = new Map<string, number>();
  for (const row of rows) {
    const match = GAME_URL.exec(row);
    if (match?.[1] && match[2]) ids.set(match[1], Number(match[2]));
  }
  console.log(`corpus: ${ids.size} puzzle games known (${streamed.length} rows streamed)`);
  // Shuffled by hash, so the first ones fetched are not all one rating.
  return new Map([...ids].sort(([a], [b]) => unitHash(a) - unitHash(b)));
}

/** Games from the head of the newest monthly dump, not tied to a puzzle
 * (quiet games too), shuffled by hash. The last one is cut by `head`: dropped. */
function dumpGames(lines: number): CorpusGame[] {
  const url = execSync(`curl -sL ${DUMP_LIST_URL} | head -n 1`, { shell: '/bin/bash' }).toString().trim();
  if (!url.endsWith('.pgn.zst')) throw new Error(`no monthly dump in ${DUMP_LIST_URL}`);
  const pgns = execSync(`curl -sL ${url} | zstd -dc 2>/dev/null | head -n ${lines}`, { maxBuffer: 1 << 30, shell: '/bin/bash' }).toString().split(/\n\n(?=\[Event )/).slice(0, -1);
  return pgns
    .filter((pgn) => Number(/\[TimeControl "(\d+)/.exec(pgn)?.[1]) >= MIN_BASE_SECONDS)
    .map((pgn) => lichessGame(pgn, new Map()))
    .filter((game): game is CorpusGame => game !== null)
    .sort((a, b) => unitHash(a.id) - unitHash(b.id));
}

/** Lichess drops the connection now and then: three tries, a minute apart. */
async function exportGames(ids: string[]): Promise<string[]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch('https://lichess.org/api/games/export/_ids?moves=true&clocks=false&evals=false&opening=true', {
        method: 'POST',
        headers: { Accept: 'application/x-chess-pgn', 'Content-Type': 'text/plain' },
        body: ids.join(',')
      });
      if (!response.ok) throw new Error(`lichess export failed: ${response.status} ${await response.text()}`);
      return (await response.text()).split(/\n\n(?=\[Event )/).filter((pgn) => pgn.trim());
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`corpus: ${error instanceof Error ? error.message : String(error)}; waiting a minute (try ${attempt} of 3)`);
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
  }
}

/** The monthly dump has no Variant header (it is all standard). */
function lichessGame(pgn: string, focus: Map<string, number>): CorpusGame | null {
  const { headers, positions } = parsePgn(pgn);
  const id = headers.GameId ?? headers.Site?.split('/').pop();
  if (!id || (headers.Variant ?? 'Standard') !== 'Standard' || positions.length < 20) return null;
  const elo = (Number(headers.WhiteElo) + Number(headers.BlackElo)) / 2;
  if (!Number.isFinite(elo)) return null;
  const band = BANDS.find(([limit]) => elo < limit)?.[1] ?? '2200+';
  return { id, source: 'lichess', band, split: splitOf(id), readerSide: unitHash(`side:${id}`) < 0.5 ? 'white' : 'black', pgn: pgn.trim(), focusPly: focus.get(id) ?? null, evalsFile: null };
}

export function splitOf(id: string): 'dev' | 'holdout' {
  return unitHash(`split:${id}`) < 0.8 ? 'dev' : 'holdout';
}

/** Games the owner reported, always in dev: each one showed a wrong
 * sentence. `seeds/<id>.evals.json`, when there, holds the evals the report was made from. */
function seedGames(): CorpusGame[] {
  const seeds = JSON.parse(readFileSync(path.join(here, 'seeds.json'), 'utf8')) as { id: string; readerSide: 'white' | 'black'; pgn: string; note: string; expect?: SeedExpectation[] }[];
  return seeds.map((seed) => {
    const evalsFile = path.join(here, 'seeds', `${seed.id.replace(/^seed:/, '')}.evals.json`);
    return { ...seed, source: 'seed', band: 'seed', split: 'dev', focusPly: null, evalsFile: existsSync(evalsFile) ? evalsFile : null };
  });
}

/** The golden courses: their dossiers are what course prompts get. */
function goldenGames(): CorpusGame[] {
  return loadGoldenSet().map((course) => ({ id: `golden:${course.name}`, source: 'golden', band: course.kind, split: splitOf(course.name), readerSide: course.intake.learnerSide ?? 'white', pgn: course.intake.pgn, focusPly: null, evalsFile: null }));
}
