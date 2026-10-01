import { fork } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeEngineBackend } from '../../src/services/engine/native-engine-backend.js';
import { GoldenEngineCache } from '../golden-engine-cache.js';
import { analyseGame } from './analyze.js';
import { checkItem } from './checks.js';
import type { CorpusGame } from './corpus.js';
import { extractItems } from './items.js';
import { StoredEvalsEngine } from './stored-engine.js';
import { paths, readJsonl, unitHash, writeJsonl } from './store.js';
import type { AuditItem, AuditPosition } from './types.js';

export interface RunOptions {
  engineUrl: string;
  only: string | null;
  split: 'dev' | 'holdout' | null;
  limit: number | null;
  /** Games in flight at once in one process (the engine's pool is the limit). */
  jobs: number;
  /** Processes the games are dealt to: the app's analysis is CPU-bound
   * (about 15 seconds a game with every engine answer cached), so one
   * process re-runs the dev split in most of an hour. */
  procs: number;
  /** Share of positions whose unsettled sentences go into the scored sample. */
  sampleRate: number;
  /** Set in a child process: analyse this share of the games (`2/6`) and write them to a shard file. */
  shard: string | null;
}

interface Analysed {
  positions: AuditPosition[];
  items: AuditItem[];
}

/** Every corpus game through the app's code, every sentence checked. The
 * engine cache makes a re-run after a code change engine-free. */
export async function runAudit(options: RunOptions): Promise<Analysed> {
  const games = selectGames(readJsonl<CorpusGame>(paths.corpus), options);
  if (!games.length) throw new Error('no corpus games: run `corpus` first');
  if (options.shard) {
    const [index, of] = options.shard.split('/').map(Number);
    const mine = await analyseGames(games.filter((_, at) => at % (of ?? 1) === index), options);
    writeFileSync(shardFile(index ?? 0), JSON.stringify(mine));
    return mine;
  }
  const procs = Math.min(options.procs, games.length);
  const { positions, items } = procs > 1 ? await analyseInProcesses(procs, options) : await analyseGames(games, options);
  // A partial run (`--only`, `--split`, `--limit`) replaces just its own games.
  const rerun = new Set(games.map((game) => game.id));
  const keptPositions = readJsonl<AuditPosition>(paths.positions).filter((position) => !rerun.has(position.gameId));
  const keptItems = readJsonl<AuditItem>(paths.items).filter((item) => !rerun.has(item.gameId));
  writeJsonl(paths.positions, [...keptPositions, ...positions]);
  writeJsonl(paths.items, [...keptItems, ...items]);
  return { positions, items };
}

async function analyseGames(games: CorpusGame[], options: RunOptions): Promise<Analysed> {
  const cache = new GoldenEngineCache(new NativeEngineBackend(options.engineUrl), paths.engineCache);
  const positions: AuditPosition[] = [];
  const items: AuditItem[] = [];
  let done = 0;
  const queue = [...games];
  const worker = async (): Promise<void> => {
    for (let game = queue.shift(); game; game = queue.shift()) {
      try {
        const engine = game.evalsFile ? new StoredEvalsEngine(game.evalsFile, cache) : cache;
        const extracted = extractItems(await analyseGame(game, engine));
        const byKey = new Map(extracted.positions.map((position) => [position.key, position]));
        for (const item of extracted.items) {
          const position = byKey.get(item.positionKey);
          if (position) items.push(checked(item, position, options.sampleRate));
        }
        positions.push(...extracted.positions);
      } catch (error) {
        console.error(`${game.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      done += 1;
      if (done % 10 === 0) {
        cache.save();
        console.log(`analysed ${done}/${games.length}${options.shard ? ` (process ${options.shard})` : ''}`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.jobs }, worker));
  cache.save();
  return { positions, items };
}

/** The same command once per process, each with its share of the games;
 * their shard files are read back and removed. */
async function analyseInProcesses(procs: number, options: RunOptions): Promise<Analysed> {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.ts');
  const args = ['run', '--engine-url', options.engineUrl, '--jobs', String(options.jobs), '--sample-rate', String(options.sampleRate)];
  if (options.only) args.push('--only', options.only);
  if (options.split) args.push('--split', options.split);
  if (options.limit) args.push('--limit', String(options.limit));
  await Promise.all(
    Array.from({ length: procs }, (_, index) => {
      const child = fork(cli, [...args, '--shard', `${index}/${procs}`], { stdio: 'inherit' });
      return new Promise<void>((resolve, reject) => {
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`process ${index}/${procs} ended with code ${code}`))));
      });
    })
  );
  const analysed: Analysed = { positions: [], items: [] };
  for (let index = 0; index < procs; index += 1) {
    const shard = JSON.parse(readFileSync(shardFile(index), 'utf8')) as Analysed;
    analysed.positions.push(...shard.positions);
    analysed.items.push(...shard.items);
    rmSync(shardFile(index));
  }
  return analysed;
}

function shardFile(index: number): string {
  return path.join(path.dirname(paths.items), `shard-${index}.json`);
}

/** The item with its checks run. A seed's unsettled sentences are all in
 * the scored sample; elsewhere a share of the positions. */
function checked(item: AuditItem, position: AuditPosition, sampleRate: number): AuditItem {
  const { checks, settled } = checkItem(item, position);
  const sampled = !settled && (item.gameId.startsWith('seed:') || unitHash(`sample:${item.positionKey}`) < sampleRate);
  return { ...item, checks, settled, sampled };
}

/** The checks again over the stored sentences, with no analysis: after a
 * change to a check (not to the app's code) this takes seconds, a run takes
 * ten seconds a game. */
export function recheckItems(sampleRate: number): AuditItem[] {
  const byKey = new Map(readJsonl<AuditPosition>(paths.positions).map((position) => [position.key, position]));
  const items = readJsonl<AuditItem>(paths.items).map((item) => {
    const position = byKey.get(item.positionKey);
    return position ? checked(item, position, sampleRate) : item;
  });
  writeJsonl(paths.items, items);
  return items;
}

function selectGames(games: CorpusGame[], options: RunOptions): CorpusGame[] {
  const picked = games.filter((game) => (!options.only || game.id.includes(options.only)) && (!options.split || game.split === options.split));
  return options.limit ? picked.slice(0, options.limit) : picked;
}
