import type { Kysely } from 'kysely';
import type { EngineMode } from '@freechesscoach/shared';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { EngineUnavailableError } from '../../lib/errors.js';
import { BrowserTunnelEngineBackend } from './browser-tunnel-engine-backend.js';
import { CachingEngineBackend } from './caching-engine-backend.js';
import { ChessApiEngineBackend } from './chess-api-engine-backend.js';
import type { EngineBackend } from './engine-backend.js';
import { EngineSourceLoggingBackend, logEngineSourceUsage, type EngineSource } from './engine-source-usage.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import { FallbackEngineBackend } from './fallback-engine-backend.js';
import { LichessEvalEngineBackend } from './lichess-eval-engine-backend.js';
import type { LichessEvalReader } from './lichess-eval-index.js';
import { LiteSupplementedEngineBackend } from './lite-supplemented-engine-backend.js';
import { NativeEngineBackend } from './native-engine-backend.js';
import { createTunnelFetch } from './tunnel-fetch.js';

export interface ResolveEngineBackendOptions {
  db: Kysely<Database>;
  engineUrl: string;
  tunnelTransport: EngineTunnelTransport;
  tunnelTimeoutMs: number;
  chessApiTimeoutMs: number;
  chessApiRequestDelayMs: number;
  /** Opened once at process start (see bootstrap.ts's
   * openLichessEvalIndexFromEnv) and threaded through here rather than
   * opened per call — null when LICHESS_EVAL_INDEX_PATH isn't set, in which
   * case the Lichess tier is skipped entirely and behavior is unchanged. */
  lichessEvalIndex: LichessEvalReader | null;
  /** True for options built in worker.ts (background jobs), false for
   * interactive routes. The pipeline contract is the same in both cases;
   * this remains part of the options surface for callers that need to label
   * the request as background work. */
  backgroundJob: boolean;
}

/**
 * Reads the user's engineMode and returns the right EngineBackend, wrapped
 * in CachingEngineBackend so every caller gets caching uniformly, and — when
 * configured — wrapped again in LichessEvalEngineBackend so a position the
 * Lichess community has already evaluated is served from the read-only
 * index instead of ever reaching the raw engine or position_evaluations.
 * Applied uniformly across every engineMode, ahead of the mode-specific
 * backend, so every user benefits regardless of their engine setting.
 * Replaces bootstrap-time wiring — call this fresh per session/job/request
 * rather than once at process start (design spec §3).
 */
export async function resolveEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return buildEnginePipeline(options, userId, raw, mode, { cache: true, supplementBreadth: true });
}

/**
 * Resolves the same engine pipeline as resolveEngineBackend, but without the
 * standard position_evaluations cache. Bot searches request a different
 * depth/multiPv than official analysis, so sharing that FEN-only cache would
 * be incorrect. The source priority remains identical: Lichess first,
 * selected user method next, then the configured fallback/supplement stages.
 */
export async function resolveRawEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return buildEnginePipeline(options, userId, raw, mode, { cache: false, supplementBreadth: true });
}

interface EnginePipelineOptions {
  cache: boolean;
  supplementBreadth: boolean;
}

/**
 * The one source-order contract shared by review, interactive analysis, hints,
 * and bot move generation:
 *
 *   Lichess index -> selected user method -> fallback/supplement stages
 *
 * Lichess is the outermost decorator intentionally. A successful lookup
 * returns immediately and cannot invoke a selected engine or browser-lite.
 * Browser-lite is inside the Lichess decorator, so it can only widen a result
 * after the selected method was actually needed and returned too few lines.
 */
function buildEnginePipeline(
  options: ResolveEngineBackendOptions,
  userId: string,
  selectedBackend: EngineBackend,
  mode: EngineMode,
  pipeline: EnginePipelineOptions
): EngineBackend {
  const isExternalSource = mode === 'browser' || mode === 'chess_api';
  const fallbackSource: Extract<EngineSource, 'internalEngine' | 'externalEngine'> = isExternalSource
    ? 'externalEngine'
    : 'internalEngine';

  let backend = selectedBackend;
  if (pipeline.cache) backend = new CachingEngineBackend(options.db, backend, { isExternalSource });
  if (pipeline.supplementBreadth) {
    backend = new LiteSupplementedEngineBackend(backend, options.tunnelTransport, userId, {
      timeoutMs: options.tunnelTimeoutMs,
      mainBucket: mainBucketFor(mode)
    });
  }

  if (!options.lichessEvalIndex) return new EngineSourceLoggingBackend(backend, userId, fallbackSource);

  return new LichessEvalEngineBackend(options.lichessEvalIndex, backend, {
    onLookup: ({ hits, misses }) => logEngineSourceUsage(userId, { lichessIndex: hits, [fallbackSource]: misses })
  });
}

/** The user's own engineMode — the one thing the lite decorator's debug
 * bucket needs when the backend itself has already been built (see
 * `resolveReviewEngineBackend`), so asking for it never has to construct a
 * second, unused raw backend. */
async function engineModeForUser(options: ResolveEngineBackendOptions, userId: string): Promise<EngineMode> {
  const user = await usersRepo.findById(options.db, userId);
  if (!user) throw new EngineUnavailableError(`Unknown user ${userId}`);
  return user.engineMode;
}

/** Which BotMoveDebugCollector bucket a main call's own result belongs under
 * (see bot-move-debug.ts) — derived from the user's engineMode, and shared
 * by every caller that wraps a backend in LiteSupplementedEngineBackend. */
function mainBucketFor(mode: EngineMode): 'internal' | 'external' | 'browser' {
  return mode === 'native' ? 'internal' : mode === 'chess_api' ? 'external' : 'browser';
}

async function resolveRawBackendForUser(
  options: ResolveEngineBackendOptions,
  userId: string
): Promise<{ raw: EngineBackend; mode: EngineMode }> {
  const mode = await engineModeForUser(options, userId);
  const nativeFallback = mode === 'native' ? undefined : new NativeEngineBackend(options.engineUrl);
  const raw: EngineBackend =
    mode === 'browser'
      ? new FallbackEngineBackend(
          new BrowserTunnelEngineBackend(options.tunnelTransport, userId, options.tunnelTimeoutMs),
          nativeFallback ?? new NativeEngineBackend(options.engineUrl),
          'native'
        )
      : mode === 'chess_api'
        ? new ChessApiEngineBackend(
            options.chessApiTimeoutMs,
            createTunnelFetch(options.tunnelTransport, userId, options.chessApiTimeoutMs),
            options.chessApiRequestDelayMs,
            nativeFallback
          )
        : new NativeEngineBackend(options.engineUrl);

  return { raw, mode };
}

/**
 * Game review uses the same source-order contract as every other caller:
 * cache policy is added around the user's selected method, Lichess remains
 * first, reliable fallback remains next, and browser-lite fills a candidate
 * shortfall when more paths are needed.
 *
 * Review goes through `analyzeGame`, which the lite decorator used to
 * delegate straight through — so review never touched the browser worker at
 * all, and `docs/tactics-rework.md` §5 layer 2 verifies claims against the
 * engine's *lines*, not just its best move. chess-api.com caps free-tier
 * variants at five and often returns fewer, and the Lichess index serves
 * whatever line count the community stored, so on many positions there was
 * nothing to verify against.
 *
 * The decorator sits **outside** the cache on purpose. Everything inside it
 * still reads and writes `position_evaluations` exactly as before, and the
 * widened lines never get written back — they are not the trusted official
 * evaluation, they live for the length of the job that asked for them, and
 * that job stores what it concluded from them (the verified claims) rather
 * than the lines themselves.
 *
 * This resolver is called by the background analysis worker. The lite pass
 * is bounded per pipeline instance, and a user with no tab connected simply
 * gets the selected/fallback result unchanged.
 */
export async function resolveReviewEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return buildEnginePipeline(options, userId, raw, mode, { cache: true, supplementBreadth: true });
}
