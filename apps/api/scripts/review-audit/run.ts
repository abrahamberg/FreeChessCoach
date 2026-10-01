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
  jobs: number;
  /** Share of positions whose unsettled sentences go into the scored sample. */
  sampleRate: number;
}

/** Every corpus game through the app's code, every sentence checked. The
 * engine cache makes a re-run after a code change engine-free. */
export async function runAudit(options: RunOptions): Promise<{ positions: AuditPosition[]; items: AuditItem[] }> {
  const games = selectGames(readJsonl<CorpusGame>(paths.corpus), options);
  if (!games.length) throw new Error('no corpus games: run `corpus` first');
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
          if (!position) continue;
          const { checks, settled } = checkItem(item, position);
          const sampled = !settled && (game.source === 'seed' || unitHash(`sample:${item.positionKey}`) < options.sampleRate);
          items.push({ ...item, checks, settled, sampled });
        }
        positions.push(...extracted.positions);
      } catch (error) {
        console.error(`${game.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      done += 1;
      if (done % 10 === 0) {
        cache.save();
        console.log(`analysed ${done}/${games.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.jobs }, worker));
  cache.save();
  // A partial run (`--only`, `--split`, `--limit`) replaces just its own games.
  const rerun = new Set(games.map((game) => game.id));
  const keptPositions = readJsonl<AuditPosition>(paths.positions).filter((position) => !rerun.has(position.gameId));
  const keptItems = readJsonl<AuditItem>(paths.items).filter((item) => !rerun.has(item.gameId));
  writeJsonl(paths.positions, [...keptPositions, ...positions]);
  writeJsonl(paths.items, [...keptItems, ...items]);
  return { positions, items };
}

function selectGames(games: CorpusGame[], options: RunOptions): CorpusGame[] {
  const picked = games.filter((game) => (!options.only || game.id.includes(options.only)) && (!options.split || game.split === options.split));
  return options.limit ? picked.slice(0, options.limit) : picked;
}
