import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from '../src/services/engine/engine-backend.js';

/** The golden script's own engine cache, on disk: a facts pass that only
 * changes wording code searched all 66 courses again, about 20 minutes of
 * Stockfish for no new fact. Keyed by position and search settings; delete
 * the file (or pass --no-cache) after an engine upgrade. Never used by the
 * app. */
export class GoldenEngineCache implements EngineBackend {
  private readonly games = new Map<string, EngineEval>();
  private readonly positions = new Map<string, PositionAnalysis>();
  private dirty = false;

  constructor(
    private readonly inner: EngineBackend,
    private readonly path: string
  ) {
    this.merge();
  }

  /** Takes in what the file has and this cache has not. */
  private merge(): void {
    if (!existsSync(this.path)) return;
    const stored = JSON.parse(readFileSync(this.path, 'utf8')) as { games?: [string, EngineEval][]; positions?: [string, PositionAnalysis][] };
    for (const [key, value] of stored.games ?? []) if (!this.games.has(key)) this.games.set(key, value);
    for (const [key, value] of stored.positions ?? []) if (!this.positions.has(key)) this.positions.set(key, value);
  }

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    const key = cacheKey(fen, opts);
    const hit = this.positions.get(key);
    if (hit) return hit;
    const analysis = await this.inner.analyzePosition(fen, opts);
    this.positions.set(key, analysis);
    this.dirty = true;
    return analysis;
  }

  /** Only the positions not seen before go to the engine; each eval keeps
   * its ply in this call. */
  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const missing = [...new Set(fens.filter((fen) => !this.games.has(cacheKey(fen, opts))))];
    if (missing.length) {
      const evals = await this.inner.analyzeGame(missing, opts);
      missing.forEach((fen, index) => {
        const found = evals[index];
        if (found) this.games.set(cacheKey(fen, opts), found);
      });
      this.dirty = true;
    }
    return fens.map((fen, ply) => {
      const found = this.games.get(cacheKey(fen, opts));
      if (!found) throw new Error(`the engine returned no eval for ${fen}`);
      return { ...found, ply, fen };
    });
  }

  /** Two processes may share the file (an audit run and a fixer's re-run):
   * what the other one saved is merged in first, and the file is swapped in
   * whole, so neither loses searches nor reads half a file. */
  save(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.path), { recursive: true });
    this.merge();
    const partial = `${this.path}.${process.pid}.tmp`;
    writeFileSync(partial, JSON.stringify({ games: [...this.games], positions: [...this.positions] }));
    renameSync(partial, this.path);
    this.dirty = false;
  }
}

export function cacheKey(fen: string, opts: EngineBackendAnalyzeOptions | undefined): string {
  return [fen, opts?.depth ?? '', opts?.multiPv ?? '', opts?.minLines ?? ''].join('|');
}
