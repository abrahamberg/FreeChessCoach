import type { Kysely } from 'kysely';
import { assertEvalSignConvention, computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { EngineEval, PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';
import * as positionEvaluationsRepo from '../../db/repositories/position-evaluations.js';
import type { Database } from '../../db/schema.js';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';

/** `isExternalSource` controls both the read trust filter (`allowExternal`)
 * and the write trust flag (`isExternalEval`) used against
 * `positionEvaluationsRepo`: `false` for a native raw backend, `true` for a
 * browser-tunnel one (engine-backend-boundary design §7). */
export interface CachingEngineBackendOptions {
  isExternalSource: boolean;
}

/**
 * Decorator implementing `EngineBackend` by wrapping whichever raw backend
 * was resolved (native or browser-tunnel), adding transparent
 * `position_evaluations` caching to both operations. Replaces
 * `position-analysis-cache.ts`'s single-position-only cache, and adds the
 * first batch-analysis caching in the system.
 *
 * The two operations use different cache shapes on purpose (design §6):
 * `analyzePosition` caches the rich `PositionAnalysis` (full PVs, features)
 * as-is, while `analyzeGame` works with lean `EngineEval[]` and, on a miss,
 * writes a *degraded* `PositionAnalysis` back (single-move "PV" per line —
 * see `toDetailedAnalysis`). A later native `analyzePosition` call for that
 * same fen heals the row with a real multi-move PV.
 */
export class CachingEngineBackend implements EngineBackend {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly raw: EngineBackend,
    private readonly options: CachingEngineBackendOptions
  ) {}

  /** Cache-first single-position lookup: a hit returns the stored rich
   * analysis untouched; a miss computes via the raw backend and persists it
   * verbatim (full PVs — no degradation on this path). */
  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    const cached = await positionEvaluationsRepo.findByFen(this.db, fen, {
      allowExternal: this.options.isExternalSource
    });
    if (cached && isSignConventionValid(cached.fen, cached.lines)) return cached;

    const analysis = await this.raw.analyzePosition(fen, opts);
    await this.writeAnalyses([analysis]);
    return analysis;
  }

  /** Cache-first batch lookup: de-duplicates `fens`, serves whatever's
   * already cached, sends only the genuine misses to the raw backend as one
   * batched call, writes those back (degraded PV — see class doc), and
   * merges everything back into `fens`' original order with corrected `ply`
   * indices (a duplicate fen can appear at more than one ply). */
  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    if (fens.length === 0) return [];

    const uniqueFens = Array.from(new Set(fens));
    const cachedByFen = await positionEvaluationsRepo.findManyByFens(this.db, uniqueFens, {
      allowExternal: this.options.isExternalSource
    });

    const resultByFen = new Map<string, EngineEval>();
    for (const [fen, analysis] of cachedByFen) {
      // A row that predates (or otherwise violates) the sign-convention
      // invariant would deterministically fail assertEvalSignConvention
      // downstream on every future analysis touching this fen — treating it
      // as a miss instead lets the raw backend recompute it and self-heals
      // the cache on write-back, rather than permanently wedging this fen.
      if (isSignConventionValid(fen, analysis.lines)) {
        resultByFen.set(fen, toLeanEval(analysis));
      }
    }

    const missedFens = uniqueFens.filter((fen) => !resultByFen.has(fen));
    if (missedFens.length > 0) {
      const computed = await this.raw.analyzeGame(missedFens, opts);
      await this.writeAnalyses(computed.map((evalResult) => toDetailedAnalysis(evalResult.fen, evalResult)));
      for (const evalResult of computed) {
        resultByFen.set(evalResult.fen, evalResult);
      }
    }

    return fens.map((fen, ply) => {
      const evalResult = resultByFen.get(fen);
      if (!evalResult) {
        throw new Error(`CachingEngineBackend.analyzeGame: no result available for fen "${fen}"`);
      }
      return { ...evalResult, ply };
    });
  }

  private async writeAnalyses(analyses: PositionAnalysis[]): Promise<void> {
    await positionEvaluationsRepo.upsertMany(
      this.db,
      analyses.map((analysis) => ({
        fen: analysis.fen,
        depth: analysis.depth,
        multiPv: analysis.multiPv,
        analysis
      })),
      { isExternalEval: this.options.isExternalSource }
    );
  }
}

/** Guards a cache hit before trusting it — see the call sites' comments for
 * why either kind of violation should be treated as a miss rather than left
 * to cause problems further downstream.
 *
 * Two independent checks: `assertEvalSignConvention` catches a *misordered*
 * multi-line result, but can't see a single bad line on its own (it needs a
 * second line to compare against — see its doc comment). The empty-score
 * check below catches that case: a non-terminal position (`lines.length >
 * 0`) whose first line has neither `cp` nor `mateIn` means the engine that
 * produced it didn't actually return a usable score (observed once in
 * production from chess-api.com's un-typed response shape — see
 * chess-api-engine-backend.ts's Number.isFinite guard, added after this). */
function isSignConventionValid(fen: string, lines: PositionAnalysisLine[]): boolean {
  const firstLine = lines[0];
  if (firstLine && firstLine.cp === null && firstLine.mateIn === null) return false;

  try {
    assertEvalSignConvention(fen, lines);
    return true;
  } catch {
    return false;
  }
}

/** Rich → lean: drops each line's full `pvSan`, keeping just the move that
 * headed it (the shape `analyzeGame`'s callers — classifyMoves, batch DB
 * storage — expect). `ply` is a placeholder; `analyzeGame` overwrites it
 * with the position's actual index in the caller's original `fens` array. */
export function toLeanEval(analysis: PositionAnalysis): EngineEval {
  return {
    ply: 0,
    fen: analysis.fen,
    depth: analysis.depth,
    lines: analysis.lines.map((line) => ({
      moveUci: line.moveUci,
      moveSan: line.moveSan,
      cp: line.cp,
      mateIn: line.mateIn
    }))
  };
}

/** Lean → rich: rebuilds a full `PositionAnalysis` for a cache write from a
 * batch-computed `EngineEval`. The PV is intentionally degraded to a
 * single-move array — the batch path never computes full principal
 * variations (mirrors `services/engine`'s own `analyzeGame`) — healed later
 * by a native `analyzePosition` call for this fen. `bestMove`/`eval` mirror
 * `services/engine/src/analyze.ts`'s `analyzePositionDetailed`: derived from
 * the first (best) line, SAN not UCI. */
export function toDetailedAnalysis(fen: string, evalResult: EngineEval): PositionAnalysis {
  const lines: PositionAnalysisLine[] = evalResult.lines.map((line) => ({
    moveUci: line.moveUci,
    moveSan: line.moveSan,
    pvSan: [line.moveSan],
    cp: line.cp,
    mateIn: line.mateIn
  }));
  const best = lines[0];

  return {
    fen,
    depth: evalResult.depth,
    multiPv: lines.length,
    bestMove: best?.moveSan ?? null,
    eval: { cp: best?.cp ?? null, mateIn: best?.mateIn ?? null },
    lines,
    features: computePositionFeatures(fen)
  };
}
