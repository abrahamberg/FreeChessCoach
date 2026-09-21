import { ENGINE_MULTI_PV, type EngineMode, type EnginePingResponse, type PositionAnalysis } from '@freechesscoach/shared';
import * as usersRepo from '../db/repositories/users.js';
import { EngineUnavailableError } from '../lib/errors.js';
import type { EngineSource } from './engine/engine-source-usage.js';
import { resolveEngineBackend, type ResolveEngineBackendOptions } from './engine/resolve-engine-backend.js';

/** Shallower than an official analysis (ENGINE_DEFAULT_DEPTH is 16) so the
 * ping comes back quickly on every backend, but with the standard multiPv so
 * "how many alternative lines came back" is a meaningful number. */
export const ENGINE_PING_DEPTH = 12;

/** Wall-clock cap for the browser-tunnel tier only (`go depth D movetime M`)
 * — keeps a slow device from turning the ping into a half-minute wait. The
 * native and chess-api tiers bound themselves. */
export const ENGINE_PING_MOVETIME_MS = 8000;

/** One settings-page engine-ping test: analyzes the caller's FEN through the
 * exact same pipeline every other engine caller uses — resolveEngineBackend
 * (Lichess eval index → position_evaluations cache → the selected engine,
 * with the lite breadth supplement) — and reports what came back plus how
 * long the whole thing took. No special-casing of engines here on purpose:
 * the point of the test is to measure the app's real path, so a FEN the
 * Lichess community has already evaluated comes back from the bin in
 * milliseconds (the response's `source` says so), and the default test FEN
 * (ENGINE_PING_FEN) is deliberately one the bin has never seen. */
export async function runEnginePing(
  options: ResolveEngineBackendOptions,
  userId: string,
  fen: string
): Promise<EnginePingResponse> {
  const sources: EngineSource[] = [];
  const startedAt = Date.now();
  const [user, analysis] = await Promise.all([
    usersRepo.findById(options.db, userId),
    resolveEngineBackend(options, userId, { onEngineSource: (served) => sources.push(served) }).then((backend) =>
      backend.analyzePosition(fen, {
        depth: ENGINE_PING_DEPTH,
        multiPv: ENGINE_MULTI_PV,
        movetimeMs: ENGINE_PING_MOVETIME_MS,
        priority: 'interactive'
      })
    )
  ]);
  const elapsedMs = Date.now() - startedAt;
  if (!user) throw new EngineUnavailableError(`Unknown user ${userId}`);
  // Unreachable with the real pipeline (both observing paths fire exactly
  // once on success) — guarded so a decorated result can never silently
  // report a made-up source.
  const source = sources.at(-1);
  if (source === undefined) throw new EngineUnavailableError('Engine pipeline did not report a source');

  return buildPingResponse(analysis, user.engineMode, elapsedMs, source);
}

function buildPingResponse(
  analysis: PositionAnalysis,
  engineMode: EngineMode,
  elapsedMs: number,
  source: EngineSource
): EnginePingResponse {
  return { ...analysis, engineMode, source, elapsedMs };
}
