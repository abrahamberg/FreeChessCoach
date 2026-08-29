import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';

/**
 * Which tier actually served a position: the pre-built Lichess community
 * eval index (`lichessIndex`), this server's own engine — native process or
 * chess-api.com, both trusted/run server-side (`internalEngine`) — or a
 * user's browser-tunnel engine (`externalEngine`). Mirrors the
 * `isExternalSource`/`allowExternal` split already used by
 * `CachingEngineBackend`, just surfaced for analytics rather than trust.
 */
export type EngineSource = 'lichessIndex' | 'internalEngine' | 'externalEngine';

/**
 * One line per successful analyzePosition/analyzeGame call, logging how many
 * of its positions came from each tier. Plain console.log by design (matches
 * deepen-analysis.ts's existing convention) — meant to be scraped from logs
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

/**
 * Decorator for a backend that has no Lichess-index tier of its own — the
 * "Play vs Bot" raw engine (see resolveRawEngineBackend's doc comment for why
 * bot search deliberately never checks that index: it would silently hand
 * every bot a Lichess-community-strength move regardless of the bot's own
 * depth/level) and the no-index-configured path in resolveEngineBackend.
 * Every position it serves is attributed entirely to `source`, so this usage
 * still shows up in the same per-user analytics log as the
 * LichessEvalEngineBackend-wrapped path.
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
