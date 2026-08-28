import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';

/**
 * Requests 3 principal variations (the engine's own default is 2) so callers
 * get real candidate moves, not just a single judged line. Fixed across every
 * caller (coach, deepen-analysis job) on purpose: position_evaluations caches
 * by `fen` alone, so a caller requesting a different multiPv would otherwise
 * silently get back whatever multiPv the first writer happened to use.
 */
export const ENGINE_MULTI_PV = 3;

/** Wraps `POST engine/analyze-game` (architecture §4) — the lean, whole-game
 * batch path used by the fast classify/plan pipeline. */
export async function analyzeGameViaEngine(engineUrl: string, fens: string[]): Promise<EngineEval[]> {
  const response = await fetch(`${engineUrl}/analyze-game`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fens })
  });
  if (!response.ok) throw new Error(`engine analyze-game failed: HTTP ${response.status}`);
  const body = (await response.json()) as { evals: EngineEval[] };
  return body.evals;
}

/** Wraps `POST engine/analyze-position` — the rich, single-position path
 * used by the coach's live analyzePosition dependency and the
 * deepen-analysis background job. `depth` is deliberately omitted by every
 * one of those callers (undefined lets the engine service fall back to its
 * own default) — position_evaluations caches by `fen` alone, so a caller
 * requesting a different depth would silently corrupt that cache for
 * everyone else. The one caller that does pass `depth` today is the "Play
 * vs Bot" plan's bot move-selection engine, which always goes through
 * resolveRawEngineBackend (bypassing CachingEngineBackend entirely), so
 * this cache-correctness concern doesn't apply to it. */
export async function analyzePositionViaEngine(
  engineUrl: string,
  fen: string,
  multiPv: number = ENGINE_MULTI_PV,
  depth?: number
): Promise<PositionAnalysis> {
  const response = await fetch(`${engineUrl}/analyze-position`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fen, multiPv, depth })
  });
  if (!response.ok) throw new Error(`engine analyze-position failed: HTTP ${response.status}`);
  const body = (await response.json()) as { analysis: PositionAnalysis };
  return body.analysis;
}
