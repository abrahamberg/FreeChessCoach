import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';

/**
 * Keeps the engine pipeline's selected-method -> fallback-method contract in
 * one decorator. A successful selected result is never replaced; fallback is
 * entered only when the selected method cannot produce a result at all.
 */
export class FallbackEngineBackend implements EngineBackend {
  constructor(
    private readonly selected: EngineBackend,
    private readonly fallback: EngineBackend,
    private readonly fallbackName: string
  ) {}

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    try {
      return await this.selected.analyzePosition(fen, opts);
    } catch (error) {
      this.logFallback(fen, error);
      return this.fallback.analyzePosition(fen, opts);
    }
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    try {
      return await this.selected.analyzeGame(fens, opts);
    } catch (error) {
      this.logFallback(`${fens.length} positions`, error);
      return this.fallback.analyzeGame(fens, opts);
    }
  }

  private logFallback(target: string, error: unknown): void {
    console.warn(
      `FallbackEngineBackend: selected engine failed for ${target}; falling back to ${this.fallbackName} — ${describeError(error)}`
    );
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
