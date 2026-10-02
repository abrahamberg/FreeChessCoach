import { readFileSync } from 'node:fs';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from '../../src/services/engine/engine-backend.js';

/** Answers from the evals a game was analysed with, cut to the lines asked
 * for; a position they lack goes to `fallback`. */
export class StoredEvalsEngine implements EngineBackend {
  private readonly stored: Map<string, Omit<EngineEval, 'ply'>>;

  constructor(
    file: string,
    private readonly fallback: EngineBackend
  ) {
    const evals = JSON.parse(readFileSync(file, 'utf8')) as Omit<EngineEval, 'ply'>[];
    this.stored = new Map(evals.map((each) => [each.fen, each]));
  }

  analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    return this.fallback.analyzePosition(fen, opts);
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const missing = fens.filter((fen) => !this.stored.has(fen));
    const fresh = missing.length ? await this.fallback.analyzeGame(missing, opts) : [];
    const freshByFen = new Map(missing.map((fen, index) => [fen, fresh[index]]));
    return fens.map((fen, ply) => {
      const known = this.stored.get(fen);
      if (known) return { ...known, fen, ply, lines: opts?.multiPv ? known.lines.slice(0, opts.multiPv) : known.lines };
      const found = freshByFen.get(fen);
      if (!found) throw new Error(`no eval for ${fen}`);
      return { ...found, ply };
    });
  }
}
