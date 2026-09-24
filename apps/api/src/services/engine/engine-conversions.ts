import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { EngineEval, PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';

/** Rich → lean: drops each line's full `pvSan`, keeping just the move that
 * headed it (the shape `analyzeGame`'s callers — classifyMoves, batch DB
 * storage — expect). `ply` is a placeholder; `analyzeGame` overwrites it
 * with the position's actual index in the caller's original `fens` array. */
export function toLeanEval(analysis: Pick<PositionAnalysis, 'fen' | 'depth' | 'lines'>): EngineEval {
  return {
    ply: 0,
    fen: analysis.fen,
    depth: analysis.depth,
    lines: analysis.lines.map((line) => ({
      moveUci: line.moveUci,
      moveSan: line.moveSan,
      cp: line.cp,
      mateIn: line.mateIn,
      pvSan: line.pvSan
    }))
  };
}

/** Lean → rich: rebuilds a full `PositionAnalysis` for a cache write from a
 * batch-computed `EngineEval`. Preserves an already-present multi-move
 * `pvSan` (e.g. chess-api.com's captured continuation, Phase 43) untouched;
 * only degrades to a single-move array when the raw backend didn't supply
 * one — healed later by a native `analyzePosition` call for this fen either
 * way. `bestMove`/`eval` mirror `services/engine/src/analyze.ts`'s
 * `analyzePositionDetailed`: derived from the first (best) line, SAN not
 * UCI. */
export function toDetailedAnalysis(fen: string, evalResult: EngineEval): PositionAnalysis {
  const lines: PositionAnalysisLine[] = evalResult.lines.map((line) => ({
    moveUci: line.moveUci,
    moveSan: line.moveSan,
    pvSan: line.pvSan ?? [line.moveSan],
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