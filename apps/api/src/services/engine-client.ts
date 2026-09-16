import { ENGINE_MULTI_PV, type EngineEval, type EnginePriority, type PositionAnalysis } from '@freechesscoach/shared';

/**
 * Requests ENGINE_MULTI_PV principal variations (the engine's own default is
 * 2) so callers get real candidate moves, not just a single judged line.
 * Fixed across every caller (coach, deepen-analysis job) on purpose:
 * position_evaluations caches by `fen` alone, so a caller requesting a
 * different multiPv would otherwise silently get back whatever multiPv the
 * first writer happened to use. Re-exported from @freechesscoach/shared,
 * which is the canonical source (packages/chess-analysis needs the same
 * value and already depends on that package) — this re-export just keeps
 * every existing `from '../engine-client.js'` import working.
 */
export { ENGINE_MULTI_PV };

/** Wraps `POST engine/analyze-game` (architecture §4) — the lean, whole-game
 * batch path used by the fast classify/plan pipeline. Signature mirrors
 * analyzePositionViaEngine's (multiPv, depth, priority) below it. */
export async function analyzeGameViaEngine(
  engineUrl: string,
  fens: string[],
  multiPv: number = ENGINE_MULTI_PV,
  depth?: number,
  priority?: EnginePriority
): Promise<EngineEval[]> {
  const response = await fetch(`${engineUrl}/analyze-game`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fens, priority, multiPv, depth })
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
  depth?: number,
  priority?: EnginePriority
): Promise<PositionAnalysis> {
  const response = await fetch(`${engineUrl}/analyze-position`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fen, multiPv, depth, priority })
  });
  if (!response.ok) throw new Error(`engine analyze-position failed: HTTP ${response.status}`);
  const body = (await response.json()) as { analysis: PositionAnalysis };
  return body.analysis;
}
