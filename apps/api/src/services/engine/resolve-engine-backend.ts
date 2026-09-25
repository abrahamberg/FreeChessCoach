import type { Kysely } from 'kysely';
import type { EngineMode } from '@freechesscoach/shared';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { EngineUnavailableError } from '../../lib/errors.js';
import { BrowserTunnelEngineBackend } from './browser-tunnel-engine-backend.js';
import { chessApiPausedUntil } from './chess-api-pause.js';
import { ChessApiEngineBackend } from './chess-api-engine-backend.js';
import type { EngineBackend } from './engine-backend.js';
import { EngineSourceLoggingBackend, logEngineSourceUsage, type EngineSource } from './engine-source-usage.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import { FallbackEngineBackend } from './fallback-engine-backend.js';
import { LichessEvalEngineBackend } from './lichess-eval-engine-backend.js';
import type { LichessEvalReader } from './lichess-eval-index.js';
import { LiteSupplementedEngineBackend } from './lite-supplemented-engine-backend.js';
import { NativeEngineBackend } from './native-engine-backend.js';
import { EngineSourceObservingBackend } from './engine-source-usage.js';
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

/** How long a bot's own search waits on chess-api.com (through the browser
 * tunnel) before the native fallback takes over — see `withBotSearchTimeout`. */
export const DEFAULT_BOT_SEARCH_TIMEOUT_MS = 5000;

/**
 * Options for the bot's own engine search: the same as everyone else's except
 * that a chess-api.com call gives up after `botSearchTimeoutMs` (never longer
 * than the general `chessApiTimeoutMs`). The student is watching a live "your
 * move" round trip, and the fallback (native Stockfish) answers in a few
 * seconds — waiting the general 15 s first, when a stalled tunnel never answers
 * at all, cost a bot 19 s of a 29 s turn. Background jobs and analysis keep the
 * longer timeout: nobody is waiting on them.
 */
export function withBotSearchTimeout(options: ResolveEngineBackendOptions, botSearchTimeoutMs: number): ResolveEngineBackendOptions {
  return { ...options, chessApiTimeoutMs: Math.min(options.chessApiTimeoutMs, botSearchTimeoutMs) };
}

/** Per-call options for resolveEngineBackend (as opposed to the per-process
 * ResolveEngineBackendOptions). */
export interface ResolveEngineBackendCallOptions {
  /** Settings engine-ping test only: observes which pipeline tier actually
   * served the call — Lichess bin vs the selected engine. Fired exactly once
   * per successful analyzePosition/analyzeGame, after the result exists (a
   * failed call fires nothing). resolveEngineBackend is a single-position
   * API, so the value is never ambiguous; analyzeGame callers passing this
   * get one tier for the whole batch. */
  onEngineSource?: (source: EngineSource) => void;
}

/**
 * Reads the user's engineMode and returns the right EngineBackend, wrapped
 * in LichessEvalEngineBackend so a position the Lichess community has already
 * evaluated is served from the read-only index instead of ever reaching the
 * raw engine. Applied uniformly across every engineMode, ahead of the
 * mode-specific backend, so every user benefits regardless of their engine
 * setting. Replaces bootstrap-time wiring — call this fresh per session/job/request
 * rather than once at process start (design spec §3).
 */
export async function resolveEngineBackend(
  options: ResolveEngineBackendOptions,
  userId: string,
  call: ResolveEngineBackendCallOptions = {}
): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return buildEnginePipeline(options, userId, raw, mode, {
    supplementBreadth: true,
    onEngineSource: call.onEngineSource
  });
}

/**
 * Resolves the same engine pipeline as resolveEngineBackend, but without the
 * light-engine breadth supplement. Bot searches request a different
 * depth/multiPv than official analysis. The source priority remains identical:
 * Lichess first, selected user method next, then the configured fallback.
 */
export async function resolveRawEngineBackend(
  options: ResolveEngineBackendOptions,
  userId: string,
  { supplementBreadth = true }: { supplementBreadth?: boolean } = {}
): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return buildEnginePipeline(options, userId, raw, mode, { supplementBreadth });
}

interface EnginePipelineOptions {
  supplementBreadth: boolean;
  /** See ResolveEngineBackendCallOptions — threaded through so the observing
   * decorators below can report which tier served the result. */
  onEngineSource?: (source: EngineSource) => void;
}

/**
 * The one source-order contract shared by review, interactive analysis, hints,
 * and bot move generation:
 *
 *   Lichess index -> selected user method -> fallback/supplement stages
 *
 * Lichess is the outermost decorator intentionally. A successful lookup
 * returns immediately and cannot invoke the selected engine or browser-lite.
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
  if (pipeline.supplementBreadth) {
    backend = new LiteSupplementedEngineBackend(backend, options.tunnelTransport, userId, {
      timeoutMs: options.tunnelTimeoutMs,
      mainBucket: mainBucketFor(mode)
    });
  }

  if (!options.lichessEvalIndex) {
    const logged = new EngineSourceLoggingBackend(backend, userId, fallbackSource);
    return pipeline.onEngineSource
      ? new EngineSourceObservingBackend(logged, fallbackSource, pipeline.onEngineSource)
      : logged;
  }

  return new LichessEvalEngineBackend(options.lichessEvalIndex, backend, {
    onLookup: ({ hits, misses }) => {
      logEngineSourceUsage(userId, { lichessIndex: hits, [fallbackSource]: misses });
      pipeline.onEngineSource?.(hits > 0 ? 'lichessIndex' : fallbackSource);
    }
  });
}

/** The user's own engineMode — the one thing the lite decorator's debug
 * bucket needs when the backend itself has already been built (see
 * `resolveReviewEngineBackend`), so asking for it never has to construct a
 * second, unused raw backend. */
async function engineModeForUser(options: ResolveEngineBackendOptions, userId: string): Promise<EngineMode> {
  const user = await usersRepo.findById(options.db, userId);
  if (!user) throw new EngineUnavailableError(`Unknown user ${userId}`);
  // chess-api.com rate-limited this user recently: serve from our own engine
  // for the cooldown (their saved engineMode is untouched — see the settings
  // notice), so nothing keeps hammering an exhausted quota.
  if (user.engineMode === 'chess_api' && chessApiPausedUntil(user.chessApiRateLimitedAt)) return 'native';
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
            nativeFallback,
            () => usersRepo.markChessApiRateLimited(options.db, userId, new Date())
          )
        : new NativeEngineBackend(options.engineUrl);

  return { raw, mode };
}

/**
 * Game review uses the same source-order contract as every other caller:
 * Lichess first, reliable fallback next, and browser-lite fills a candidate
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
 * This resolver is called by the background analysis worker. The lite pass
 * is bounded per pipeline instance, and a user with no tab connected simply
 * gets the selected/fallback result unchanged.
 */
export async function resolveReviewEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return buildEnginePipeline(options, userId, raw, mode, { supplementBreadth: true });
}