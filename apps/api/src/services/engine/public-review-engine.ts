import { ENGINE_DEFAULT_DEPTH, type EngineEval, type PositionAnalysis, type PublicReviewEngineResponse } from '@freechesscoach/shared';
import { validateFen } from 'chess.js';
import { createConcurrencyGate, type ConcurrencyGate } from '../../lib/concurrency-gate.js';
import { RateLimitError, ValidationError } from '../../lib/errors.js';
import type { RateLimit } from '../../lib/fixed-window-counter.js';
import { createPositionBudget, type PositionBudget } from '../../lib/position-budget.js';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';
import { LichessEvalEngineBackend } from './lichess-eval-engine-backend.js';
import type { LichessEvalReader } from './lichess-eval-index.js';
import { NativeEngineBackend } from './native-engine-backend.js';
import type { ResolveEngineBackendOptions } from './resolve-engine-backend.js';

/**
 * What anonymous visitors may cost the engine, per api pod. Only searched
 * positions count: a position the Lichess eval index answers is free. A game
 * is about 80 positions, so a visitor gets about seven games an hour on the
 * server and all visitors together about fifty; past that the page goes on
 * with the engine in the browser.
 */
export interface PublicReviewEngineLimits {
  perVisitor: RateLimit;
  allVisitors: RateLimit;
  /** Batches searched at once, and batches allowed to wait for a turn. */
  maxActive: number;
  maxWaiting: number;
}

const HOUR_MS = 60 * 60_000;

export const PUBLIC_REVIEW_ENGINE_LIMITS: PublicReviewEngineLimits = {
  perVisitor: { max: 600, windowMs: HOUR_MS },
  allVisitors: { max: 4000, windowMs: HOUR_MS },
  maxActive: 2,
  maxWaiting: 6
};

/** Refused for cost, not for a bad request: the page falls back to the
 * engine on the visitor's device and offers sign-in. */
export class PublicEngineRefusedError extends RateLimitError {
  constructor(
    readonly retryAfterSeconds: number,
    readonly reason: 'visitor_limit' | 'server_limit' | 'busy'
  ) {
    super(`The free server engine is not available right now (${reason}); try again in ${retryAfterSeconds} seconds`);
  }
}

export interface PublicReviewEngine {
  analyze(visitor: string, fens: string[], multiPv: number): Promise<PublicReviewEngineResponse>;
}

/**
 * The no-account review's server engine (docs/threat-model.md T15): the
 * Lichess eval index first, as every signed-in review does, then the native
 * engine for the positions it lacks, at the review's depth and the lowest
 * priority, under `limits`. Nothing is stored and no game is logged.
 */
export function createPublicReviewEngine(
  index: LichessEvalReader | null,
  native: Pick<EngineBackend, 'analyzeGame' | 'analyzePosition'>,
  limits: PublicReviewEngineLimits = PUBLIC_REVIEW_ENGINE_LIMITS
): PublicReviewEngine {
  const guard = new SearchGuard(native, limits);
  return {
    async analyze(visitor, fens, multiPv) {
      assertFens(fens);
      const searched = guard.forVisitor(visitor);
      let cached = 0;
      const pipeline = index
        ? new LichessEvalEngineBackend(index, searched, { onLookup: ({ hits }) => (cached = hits) })
        : searched;
      const evals = await pipeline.analyzeGame(fens, { multiPv, depth: ENGINE_DEFAULT_DEPTH, priority: 'background' });
      return { evals, cached };
    }
  };
}

/** The api's own: its index and its native engine service, or none without an engine. */
export function publicReviewEngineFor(options: ResolveEngineBackendOptions | undefined): PublicReviewEngine | undefined {
  if (!options) return undefined;
  return createPublicReviewEngine(options.lichessEvalIndex, new NativeEngineBackend(options.engineUrl));
}

/** A FEN reaches Stockfish inside a UCI command: only a legal one goes. */
function assertFens(fens: string[]): void {
  const bad = fens.find((fen) => !validateFen(fen).ok);
  if (bad !== undefined) throw new ValidationError('Not a valid position (FEN).');
}

class SearchGuard {
  private readonly perVisitor: PositionBudget;
  private readonly allVisitors: PositionBudget;
  private readonly gate: ConcurrencyGate;

  constructor(
    private readonly native: Pick<EngineBackend, 'analyzeGame' | 'analyzePosition'>,
    private readonly limits: PublicReviewEngineLimits
  ) {
    this.perVisitor = createPositionBudget(limits.perVisitor);
    this.allVisitors = createPositionBudget(limits.allVisitors);
    this.gate = createConcurrencyGate(limits.maxActive, limits.maxWaiting);
  }

  /** The native engine as one visitor's budget sees it. */
  forVisitor(visitor: string): EngineBackend {
    const search = <T>(units: number, task: () => Promise<T>): Promise<T> => this.search(visitor, units, task);
    return {
      analyzeGame: (fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> =>
        search(fens.length, () => this.native.analyzeGame(fens, opts)),
      analyzePosition: (fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> =>
        search(1, () => this.native.analyzePosition(fen, opts))
    };
  }

  private search<T>(visitor: string, units: number, task: () => Promise<T>): Promise<T> {
    const mine = this.perVisitor.refusal(visitor, units);
    if (mine !== null) throw new PublicEngineRefusedError(mine, 'visitor_limit');
    const everyone = this.allVisitors.refusal('all', units);
    if (everyone !== null) throw new PublicEngineRefusedError(everyone, 'server_limit');
    const queued = this.gate.run(task);
    if (!queued) throw new PublicEngineRefusedError(5, 'busy');
    this.perVisitor.spend(visitor, units);
    this.allVisitors.spend('all', units);
    return queued;
  }
}
