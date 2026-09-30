import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from '../src/services/engine/engine-backend.js';
import { cacheKey } from './golden-engine-cache.js';

const EVALS_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/golden/evals');
const MAX_FILE_BYTES = 50_000;
/** Tried in turn until the file fits: the whole line, then cut. */
const PV_PLIES_LADDER = [null, 8, 4, 2, 0];

export function evalsPathFor(name: string): string {
  return path.join(EVALS_DIRECTORY, `${name}.json`);
}

/** What one course's dossier asked the engine, kept so the golden facts test
 * can answer from files. Wraps the backend with the same `analyzeGame`. */
export class EvalRecorder implements EngineBackend {
  private readonly evals = new Map<string, EngineEval>();

  constructor(private readonly inner: EngineBackend) {}

  analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    return this.inner.analyzePosition(fen, opts);
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const results = await this.inner.analyzeGame(fens, opts);
    fens.forEach((fen, index) => {
      const found = results[index];
      if (found) this.evals.set(cacheKey(fen, opts), found);
    });
    return results;
  }

  /** Writes `<name>.json`; returns how many plies of each line were kept
   * when it had to be cut, else null. */
  write(name: string): number | null {
    mkdirSync(EVALS_DIRECTORY, { recursive: true });
    const fitting = PV_PLIES_LADDER.findIndex((each) => this.serialise(each).length <= MAX_FILE_BYTES);
    const plies = PV_PLIES_LADDER[fitting === -1 ? PV_PLIES_LADDER.length - 1 : fitting] ?? null;
    const pretty = this.serialise(plies);
    writeFileSync(evalsPathFor(name), fitting === -1 ? this.serialiseOnePerPosition(plies) : pretty);
    return plies;
  }

  private serialiseOnePerPosition(pvPlies: number | null): string {
    const rows = [...this.evals.keys()].sort().map((key) => ` ${JSON.stringify(key)}: ${JSON.stringify(reduce(this.evals.get(key) as EngineEval, pvPlies))}`);
    return `{\n${rows.join(',\n')}\n}\n`;
  }

  private serialise(pvPlies: number | null): string {
    const keys = [...this.evals.keys()].sort();
    const reduced = Object.fromEntries(keys.map((key) => [key, reduce(this.evals.get(key) as EngineEval, pvPlies)]));
    return `${JSON.stringify(reduced, null, 1)}\n`;
  }
}

function reduce(found: EngineEval, pvPlies: number | null): Omit<EngineEval, 'ply'> {
  return {
    fen: found.fen,
    depth: found.depth,
    lines: found.lines.map((line) => ({
      moveSan: line.moveSan,
      moveUci: line.moveUci,
      cp: line.cp,
      mateIn: line.mateIn,
      ...(line.pvSan ? { pvSan: pvPlies === null ? line.pvSan : line.pvSan.slice(0, pvPlies) } : {})
    }))
  };
}
