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
import { LichessEvalEngineBackend } from './lichess-eval-engine-backend.js';
import type { LichessEvalReader } from './lichess-eval-index.js';
import { NativeEngineBackend } from './native-engine-backend.js';

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
  lichessEvalMinDepth: number;
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
  // 'chess_api' is called from this server, never the browser, so it's
  // trusted the same as 'native' here — only 'browser' evals are external.
  const isExternalSource = mode === 'browser';
  const cached = new CachingEngineBackend(options.db, raw, { isExternalSource });
  // Same internal/external split, reused for the engine-source-usage
  // analytics log (see engine-source-usage.ts) rather than cache trust.
  const fallbackSource: Extract<EngineSource, 'internalEngine' | 'externalEngine'> = isExternalSource
    ? 'externalEngine'
    : 'internalEngine';

  if (!options.lichessEvalIndex) return new EngineSourceLoggingBackend(cached, userId, fallbackSource);

  return new LichessEvalEngineBackend(options.lichessEvalIndex, cached, {
    minDepth: options.lichessEvalMinDepth,
    onLookup: ({ hits, misses }) => logEngineSourceUsage(userId, { lichessIndex: hits, [fallbackSource]: misses })
  });
}

/**
 * Same backend selection as resolveEngineBackend, but WITHOUT the
 * CachingEngineBackend wrapper — for the "Play vs Bot" bot move-selection
 * engine, which searches at a shallow, level-dependent depth/multiPv that
 * must never collide with or pollute the standard-depth cache every other
 * caller shares (position_evaluations is keyed by `fen` alone, with no
 * depth/multiPv discrimination — see ENGINE_DEFAULT_DEPTH's doc comment in
 * packages/shared/src/constants.ts). Bot search is cheap enough that not
 * caching it is a deliberate simplification, not a missed optimization.
 *
 * Also deliberately skips the Lichess-index tier (unlike
 * resolveEngineBackend): that index only stores deep, community-strength
 * evals, so wiring it in here would silently hand every bot — including
 * weak, low-depth personas — Lichess's best move for any position it has
 * seen, defeating the bot's own level. Still wrapped in
 * EngineSourceLoggingBackend so bot engine calls show up in the same
 * per-user analytics log as every other caller, just always attributed to
 * `internalEngine`/`externalEngine`, never `lichessIndex`.
 */
export async function resolveRawEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return new EngineSourceLoggingBackend(raw, userId, mode === 'browser' ? 'externalEngine' : 'internalEngine');
}

async function resolveRawBackendForUser(
  options: ResolveEngineBackendOptions,
  userId: string
): Promise<{ raw: EngineBackend; mode: EngineMode }> {
  const user = await usersRepo.findById(options.db, userId);
  if (!user) throw new EngineUnavailableError(`Unknown user ${userId}`);

  const mode = user.engineMode;
  const raw: EngineBackend =
    mode === 'browser'
      ? new BrowserTunnelEngineBackend(options.tunnelTransport, userId, options.tunnelTimeoutMs)
      : mode === 'chess_api'
        ? new ChessApiEngineBackend(
            options.chessApiTimeoutMs,
            fetch,
            options.chessApiRequestDelayMs,
            new NativeEngineBackend(options.engineUrl)
          )
        : new NativeEngineBackend(options.engineUrl);

  return { raw, mode };
}
