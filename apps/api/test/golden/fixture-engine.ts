import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from '../../src/services/engine/engine-backend.js';
import { cacheKey } from '../../scripts/golden-engine-cache.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evals');

/** An engine that answers one golden course from its recorded evals, so the
 * facts snapshot needs no Stockfish. A position it has no answer for fails. */
export function fixtureEngineFor(name: string): EngineBackend {
  const recorded = JSON.parse(readFileSync(path.join(directory, `${name}.json`), 'utf8')) as Record<string, Omit<EngineEval, 'ply'>>;
  return {
    analyzePosition(): Promise<PositionAnalysis> {
      return Promise.reject(new Error(`the golden fixture engine only answers analyzeGame (${name})`));
    },
    analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
      return Promise.resolve(
        fens.map((fen, ply) => {
          const found = recorded[cacheKey(fen, opts)];
          if (!found) throw new Error(`no golden eval for ${fen} in ${name}`);
          return { ...found, ply, fen };
        })
      );
    }
  };
}
