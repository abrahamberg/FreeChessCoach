import type { EngineEval, EngineSource, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';

export type { EngineSource };

/**
 * One line per successful analyzePosition/analyzeGame call, logging how many
 * of its positions came from each tier. Plain console.log by design (matches
 * the `analysis-timing:` line's convention) — meant to be scraped from logs
 * for offline analytics (e.g. "what fraction of moves are served from the
 * bin vs a live engine call"), not queried live. A zero-total call (e.g. an
 * empty analyzeGame batch) is skipped rather than logged as noise.
 */
export function logEngineSourceUsage(userId: string, counts: Partial<Record<EngineSource, number>>): void {
  const lichessIndex = counts.lichessIndex ?? 0;
  const internalEngine = counts.internalEngine ?? 0;
  const externalEngine = counts.externalEngine ?? 0;
  const total = lichessIndex + internalEngine + externalEngine;
  if (total === 0) return;

  console.log(
    `engine-source: userId=${userId} total=${total} lichessIndex=${lichessIndex} internalEngine=${internalEngine} externalEngine=${externalEngine}`
  );
}

/** Decorator for the selected-engine portion of the shared pipeline. The
 * LichessEvalEngineBackend sits outside this decorator, so a Lichess hit is
 * logged by that outer stage and never reaches here. Every position that does
 * reach the selected/fallback portion is attributed to its configured source.
 */
export class EngineSourceLoggingBackend implements EngineBackend {
  constructor(
    private readonly inner: EngineBackend,
    private readonly userId: string,
    private readonly source: Extract<EngineSource, 'internalEngine' | 'externalEngine'>
  ) {}

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    const result = await this.inner.analyzePosition(fen, opts);
    logEngineSourceUsage(this.userId, { [this.source]: 1 });
    return result;
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const result = await this.inner.analyzeGame(fens, opts);
    logEngineSourceUsage(this.userId, { [this.source]: fens.length });
    return result;
  }
}

/** Wraps a fully-built pipeline for callers that need to know which tier
 * actually served each result (the settings engine-ping test — see
 * resolve-engine-backend.ts's ResolveEngineBackendCallOptions). Distinct
 * from EngineSourceLoggingBackend, which labels the selected-engine tier
 * inside the pipeline for log analytics: this one wraps the whole thing and
 * reports through a callback instead. For analyzeGame the single source
 * value describes the whole batch. */
export class EngineSourceObservingBackend implements EngineBackend {
  constructor(
    private readonly inner: EngineBackend,
    private readonly source: EngineSource,
    private readonly onEngineSource: (source: EngineSource) => void
  ) {}

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    const result = await this.inner.analyzePosition(fen, opts);
    this.onEngineSource(this.source);
    return result;
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const result = await this.inner.analyzeGame(fens, opts);
    this.onEngineSource(this.source);
    return result;
  }
}
