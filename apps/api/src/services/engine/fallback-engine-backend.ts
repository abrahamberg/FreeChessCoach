import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';

/**
 * Keeps the engine pipeline's selected-method -> fallback-method contract in
 * one decorator. A successful selected result is never replaced; fallback is
 * entered only when the selected method cannot produce a result at all.
 *
 * Task 77.2: the first failure is sticky. Once the selected method has failed,
 * every later call on this instance goes straight to the fallback instead of
 * waiting out the selected method's timeout again (the analysis job calls
 * `analyzeGame` once per 6-position chunk). resolve-engine-backend.ts builds a
 * fresh pipeline per job/request, so the flag never outlives one job.
 */
export class FallbackEngineBackend implements EngineBackend {
  private selectedFailed = false;

  constructor(
    private readonly selected: EngineBackend,
    private readonly fallback: EngineBackend,
    private readonly fallbackName: string
  ) {}

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    if (this.selectedFailed) return this.fallback.analyzePosition(fen, opts);
    try {
      return await this.selected.analyzePosition(fen, opts);
    } catch (error) {
      this.markSelectedFailed(fen, error);
      return this.fallback.analyzePosition(fen, opts);
    }
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    if (this.selectedFailed) return this.fallback.analyzeGame(fens, opts);
    try {
      return await this.selected.analyzeGame(fens, opts);
    } catch (error) {
      this.markSelectedFailed(`${fens.length} positions`, error);
      return this.fallback.analyzeGame(fens, opts);
    }
  }

  private markSelectedFailed(target: string, error: unknown): void {
    this.selectedFailed = true;
    console.warn(
      `FallbackEngineBackend: selected engine failed for ${target}; falling back to ${this.fallbackName} for the rest of this job — ${describeError(error)}`
    );
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
