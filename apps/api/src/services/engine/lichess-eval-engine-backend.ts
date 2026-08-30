import { computePositionFeatures, uciToSan } from '@freechesscoach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH, type EngineEval, type PositionAnalysis, type PositionAnalysisLine } from '@freechesscoach/shared';
import { toLeanEval } from './caching-engine-backend.js';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';
import type { LichessEvalLookupResult, LichessEvalReader } from './lichess-eval-index.js';

export interface LichessEvalEngineBackendOptions {
  /** A hit shallower than this is treated as a miss and falls through to
   * `fallback` — defaults to ENGINE_DEFAULT_DEPTH, the same floor every
   * other backend targets, so callers never silently get a shallower
   * evaluation than they'd otherwise receive. */
  minDepth?: number;
  /** Invoked once per successful analyzePosition/analyzeGame call (after
   * `fallback` has resolved, so a failed call never gets counted) with how
   * many of its positions were served directly from the index vs fell
   * through to `fallback`. Lets a composition-root caller (see
   * resolveEngineBackend) log per-user source-usage analytics without this
   * class needing to know anything about users or logging destinations. */
  onLookup?: (counts: { hits: number; misses: number }) => void;
}

/**
 * Checks the pre-built, read-only Lichess evaluation index (~394M positions
 * the chess community has already analyzed — see lichess-eval-index.ts)
 * before ever calling `fallback`. A hit is returned directly and,
 * deliberately, never written to position_evaluations: that table exists to
 * cache *this app's own* engine calls, and duplicating data that's already
 * durably available in this read-only index would only cost storage for no
 * benefit. A miss, or a hit shallower than `minDepth`, falls straight
 * through to `fallback` unchanged — normally CachingEngineBackend(raw), so
 * its own caching/pruning behavior for genuinely Lichess-unseen positions is
 * untouched. Intended as the new outermost layer in resolveEngineBackend,
 * applied uniformly across every engineMode.
 */
export class LichessEvalEngineBackend implements EngineBackend {
  private readonly minDepth: number;
  private readonly onLookup?: (counts: { hits: number; misses: number }) => void;

  constructor(
    private readonly index: LichessEvalReader,
    private readonly fallback: EngineBackend,
    options: LichessEvalEngineBackendOptions = {}
  ) {
    this.minDepth = options.minDepth ?? ENGINE_DEFAULT_DEPTH;
    this.onLookup = options.onLookup;
  }

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    const hit = await this.lookupHit(fen, opts);
    if (hit) {
      this.onLookup?.({ hits: 1, misses: 0 });
      return hit;
    }

    const result = await this.fallback.analyzePosition(fen, opts);
    this.onLookup?.({ hits: 0, misses: 1 });
    return result;
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const hits = await Promise.all(fens.map((fen) => this.lookupHit(fen, opts)));
    const missedPlies = hits.flatMap((hit, ply) => (hit ? [] : [ply]));

    const computed =
      missedPlies.length > 0 ? await this.fallback.analyzeGame(missedPlies.map((ply) => fens[ply]!), opts) : [];
    const computedByPly = new Map(missedPlies.map((ply, i) => [ply, computed[i]!]));

    this.onLookup?.({ hits: hits.length - missedPlies.length, misses: missedPlies.length });
    return hits.map((hit, ply) => (hit ? { ...toLeanEval(hit), ply } : { ...computedByPly.get(ply)!, ply }));
  }

  private async lookupHit(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis | null> {
    const minDepth = Math.max(this.minDepth, opts?.depth ?? ENGINE_DEFAULT_DEPTH);
    const result = await this.index.lookup(fen);
    if (!result || result.depth < minDepth) return null;
    return toPositionAnalysis(fen, result);
  }
}

/** Maps every stored line (up to LICHESS_EVAL_MAX_LINES, not just the best
 * one) into a real multiPv `PositionAnalysis` — this is what actually lets
 * positions served from this index participate in "available"/"prevented"
 * tactic scanning with real alternate lines, not just a single move. */
function toPositionAnalysis(fen: string, result: LichessEvalLookupResult): PositionAnalysis {
  const lines: PositionAnalysisLine[] = result.lines.map((line) => {
    const moveSan = uciToSan(fen, line.moveUci);
    return { moveUci: line.moveUci, moveSan, pvSan: [moveSan], cp: line.cp, mateIn: line.mate };
  });
  const best = lines[0];

  return {
    fen,
    depth: result.depth,
    multiPv: lines.length,
    bestMove: best?.moveSan ?? null,
    eval: { cp: best?.cp ?? null, mateIn: best?.mateIn ?? null },
    lines,
    features: computePositionFeatures(fen)
  };
}
