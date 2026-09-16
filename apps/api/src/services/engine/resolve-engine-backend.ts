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
import { LiteSupplementedEngineBackend } from './lite-supplemented-engine-backend.js';
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
 *
 * Whatever `raw` backend the user's mode resolved to is wrapped in
 * LiteSupplementedEngineBackend, which fills a candidate-breadth shortfall
 * from the lightweight browser worker when one's connected. Deliberately
 * does NOT fall back to the native engine when a non-native mode is still
 * short on breadth (no tunnel connected, and chess-api.com's own 5-line
 * cap) — a user who picked 'chess_api' or 'browser' should never have the
 * bot's move-selection silently reach for the server's own native engine
 * behind their back; a narrower candidate pool in that case is the honest
 * cost of the setting they chose, not a bug to paper over. Never touches
 * position_evaluations; see its own doc comment.
 */
export async function resolveRawEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  const liteSupplemented = new LiteSupplementedEngineBackend(raw, options.tunnelTransport, userId, {
    timeoutMs: options.tunnelTimeoutMs,
    mainBucket: mainBucketFor(mode),
    // Only do the lite round trip when the position is actually tactically
    // sharp — see LiteSupplementedEngineBackendOptions' doc comment. Never
    // set on resolveReviewEngineBackend below, whose probes keep asking for
    // every shortfall regardless of sharpness.
    gateLiveSupplementBySharpness: true
  });
  return new EngineSourceLoggingBackend(liteSupplemented, userId, mode === 'browser' ? 'externalEngine' : 'internalEngine');
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

/**
 * The backend game review analyses with: everything `resolveEngineBackend`
 * gives (cache, Lichess index, the user's own mode) plus the lite browser
 * worker filling in breadth on the plies that are actually sharp.
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
 * Only worth calling from the background analysis worker: the lite pass
 * spends up to about a minute of a connected browser tab, and a user with no
 * tab connected simply gets today's narrower analysis.
 */
export async function resolveReviewEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const cached = await resolveEngineBackend(options, userId);
  // The mode alone, not a second raw backend: resolveRawBackendForUser would
  // build (and immediately discard) another NativeEngineBackend /
  // ChessApiEngineBackend / BrowserTunnelEngineBackend just to read it.
  const mode = await engineModeForUser(options, userId);

  return new LiteSupplementedEngineBackend(cached, options.tunnelTransport, userId, {
    timeoutMs: options.tunnelTimeoutMs,
    mainBucket: mainBucketFor(mode)
  });
}
