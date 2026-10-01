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
}

const here = path.dirname(fileURLToPath(import.meta.url));
const PUZZLE_FIXTURE = path.join(here, '../../../../packages/chess-analysis/data/lichess-puzzle-motifs.csv');
const PUZZLE_DB_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const BANDS: [number, string][] = [
  [1000, '<1000'],
  [1400, '1000-1399'],
  [1800, '1400-1799'],
  [2200, '1800-2199'],
  [Infinity, '2200+']
];
const GAME_URL = /lichess\.org\/(\w{8})(?:\/(?:white|black))?#(\d+)/;

export interface CorpusOptions {
  perBand: number;
  /** Puzzle rows streamed from the full Lichess puzzle DB (0: only the repo's 360-row fixture). */
  stream: number;
}

/** Real Lichess games, found through puzzles (each has a tactic somewhere),
 * bucketed by the players' average rating; plus the seeds and golden courses. */
export async function buildCorpus(options: CorpusOptions): Promise<CorpusGame[]> {
  const existing = new Map(readJsonl<CorpusGame>(paths.corpus).map((game) => [game.id, game]));
  const focus = puzzleGameIds(options.stream);
  const perBand = new Map<string, number>();
  for (const game of existing.values()) if (game.source === 'lichess') perBand.set(game.band, (perBand.get(game.band) ?? 0) + 1);
  const wanted = [...focus.keys()].filter((id) => !existing.has(id));
  for (let start = 0; start < wanted.length && !bandsFull(perBand, options.perBand); start += 300) {
    for (const pgn of await exportGames(wanted.slice(start, start + 300))) {
      const game = lichessGame(pgn, focus);
      if (!game || (perBand.get(game.band) ?? 0) >= options.perBand) continue;
      perBand.set(game.band, (perBand.get(game.band) ?? 0) + 1);
      existing.set(game.id, game);
    }
    console.log(`corpus: ${[...perBand].map(([band, count]) => `${band} ${count}`).join(', ')}`);
  }
  for (const game of [...seedGames(), ...goldenGames()]) existing.set(game.id, game);
  const games = [...existing.values()];
  writeJsonl(paths.corpus, games);
  return games;
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
  // Shuffled by hash, so the first ones fetched are not all one rating.
  return new Map([...ids].sort(([a], [b]) => unitHash(a) - unitHash(b)));
}

async function exportGames(ids: string[]): Promise<string[]> {
  const response = await fetch('https://lichess.org/api/games/export/_ids?moves=true&clocks=false&evals=false&opening=true', {
    method: 'POST',
    headers: { Accept: 'application/x-chess-pgn', 'Content-Type': 'text/plain' },
    body: ids.join(',')
  });
  if (!response.ok) throw new Error(`lichess export failed: ${response.status} ${await response.text()}`);
  return (await response.text()).split(/\n\n(?=\[Event )/).filter((pgn) => pgn.trim());
}

function lichessGame(pgn: string, focus: Map<string, number>): CorpusGame | null {
  const { headers, positions } = parsePgn(pgn);
  const id = headers.GameId ?? headers.Site?.split('/').pop();
  if (!id || headers.Variant !== 'Standard' || positions.length < 20) return null;
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
  const seeds = JSON.parse(readFileSync(path.join(here, 'seeds.json'), 'utf8')) as { id: string; readerSide: 'white' | 'black'; pgn: string; note: string }[];
  return seeds.map((seed) => {
    const evalsFile = path.join(here, 'seeds', `${seed.id.replace(/^seed:/, '')}.evals.json`);
    return { ...seed, source: 'seed', band: 'seed', split: 'dev', focusPly: null, evalsFile: existsSync(evalsFile) ? evalsFile : null };
  });
}

/** The golden courses: their dossiers are what course prompts get. */
function goldenGames(): CorpusGame[] {
  return loadGoldenSet().map((course) => ({ id: `golden:${course.name}`, source: 'golden', band: course.kind, split: splitOf(course.name), readerSide: course.intake.learnerSide ?? 'white', pgn: course.intake.pgn, focusPly: null, evalsFile: null }));
}
