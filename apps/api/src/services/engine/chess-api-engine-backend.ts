import { computePositionFeatures, pvUciToSan } from '@freechesscoach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH, type EngineEval, type PositionAnalysis } from '@freechesscoach/shared';
import { ENGINE_MULTI_PV } from '../engine-client.js';
import { EngineUnavailableError } from '../../lib/errors.js';
import { toLeanEval } from './engine-conversions.js';
import {
  ChessApiError,
  ChessApiMalformedResponseError,
  ChessApiRateLimitedError,
  isUsableLine,
  MALFORMED_RESPONSE_RETRY_DELAYS_MS,
  normalizeChessApiLine,
  RATE_LIMIT_RETRY_DELAYS_MS,
  type ChessApiLine
} from './chess-api-response.js';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';

const CHESS_API_URL = 'https://chess-api.com/v1';
// chess-api.com's free tier caps depth at 18 and variants (its multiPv
// equivalent) at 5 — "Greater depth and more thinking time available for
// project supporters" (their docs). Requests above these are clamped rather
// than rejected, so a caller using the same depth/multiPv constants every
// other backend uses (ENGINE_DEFAULT_DEPTH=16, ENGINE_MULTI_PV=5) sits
// exactly at the cap rather than under it.
const CHESS_API_MAX_DEPTH = 18;
const CHESS_API_MAX_VARIANTS = 5;
let hasLoggedVariantShortfall = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The circuit trips after this many *consecutive* positions each needed the
// fallback — one bad position (still retried on its own, see
// MALFORMED_RESPONSE_RETRY_DELAYS_MS) isn't evidence the service is down, but
// this many in a row is. Once tripped, every later position this instance is
// asked for skips chess-api.com entirely and goes straight to native — without
// this, a fully-down chess-api.com would pay a full retry-and-backoff cycle
// (up to 3 × the timeout) for every single position before falling back.
// Task 77.2: the state lives on the instance, not per analyzeGame call, so it
// survives the analysis job's 6-position chunks. resolve-engine-backend.ts
// builds a fresh instance per job/request, so a trip never outlives one job.
const CIRCUIT_BREAKER_CONSECUTIVE_FAILURES = 3;

/**
 * Calls the free third-party https://chess-api.com/v1 HTTP API. `fetchImpl`
 * is always `createTunnelFetch(...)` (see tunnel-fetch.ts) — this server
 * never calls chess-api.com itself any more; every request reaches it
 * through the user's own connected browser tab, so it lands on chess-api.com
 * from each user's own IP rather than piling onto this server's. The result
 * always comes from the browser, so it's trusted at the same external tier
 * as 'browser' mode for engine-source logging purposes (see
 * resolve-engine-backend.ts's isExternalSource: true for 'chess_api').
 *
 * chess-api.com's `eval`/`mate` fields are already reported from White's
 * perspective, matching this codebase's own cp/mateIn convention (see
 * services/engine/src/uci.ts's `sign` flip) — no conversion needed. Each
 * returned line's continuation is walked from the requested position, so
 * the real PV is retained; responses without a continuation naturally
 * produce a single-move PV.
 *
 * There's no batch endpoint, so analyzeGame issues one HTTP call per
 * position, sequentially, pausing `requestDelayMs` between each one — the
 * same shape services/engine's own analyzeGame uses against its local pool,
 * just over the network (and paced, since this network has a stranger on
 * the other end) instead.
 *
 * `fallback`, when given, takes over one specific position if
 * chess-api.com can't produce a usable result for it (a non-2xx status, a
 * timeout, or a malformed response surviving all of request()'s retries) —
 * the rest of the user's session still runs on chess_api. This is the
 * selected-method stage of the shared pipeline; the fallback is
 * deliberately hidden behind the same engine contract so callers do not need
 * to know which reliable source produced the answer. resolve-engine-
 * backend.ts wraps this whole class — fallback included — in
 * one uniform isExternalSource: true for chess_api, so whichever of
 * chess-api.com-via-tunnel or this `fallback` actually served a given
 * position, the cache write it produces is tagged the same way —
 * substituting one for the other here doesn't introduce a mixed-trust cache
 * row. Logged, not surfaced to the user or recorded on the resulting
 * analysis — deliberately silent, since both are already treated as equally
 * trustworthy for this purpose. */
export class ChessApiEngineBackend implements EngineBackend {
  private consecutiveFailures = 0;
  private circuitOpen = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly requestDelayMs: number = 100,
    private readonly fallback?: EngineBackend
  ) {}

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    if (this.circuitOpen && this.fallback) return this.fallback.analyzePosition(fen, opts);
    return this.analyzeCountingFailures(fen, opts);
  }

  /** One chess-api.com attempt (fallback included) that feeds the circuit
   * breaker — see CIRCUIT_BREAKER_CONSECUTIVE_FAILURES. */
  private async analyzeCountingFailures(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    const { analysis, usedFallback } = await this.analyzePositionWithFailover(fen, opts);
    this.consecutiveFailures = usedFallback ? this.consecutiveFailures + 1 : 0;
    if (!this.circuitOpen && this.consecutiveFailures >= CIRCUIT_BREAKER_CONSECUTIVE_FAILURES) {
      this.circuitOpen = true;
      console.warn(
        `ChessApiEngineBackend: ${this.consecutiveFailures} consecutive failures — treating chess-api.com as down ` +
          'for the rest of this job, routing directly to native.'
      );
    }
    return analysis;
  }

  /** Same as analyzePosition, but also reports whether it had to fall back. */
  private async analyzePositionWithFailover(
    fen: string,
    opts?: EngineBackendAnalyzeOptions
  ): Promise<{ analysis: PositionAnalysis; usedFallback: boolean }> {
    const depth = Math.min(opts?.depth ?? ENGINE_DEFAULT_DEPTH, CHESS_API_MAX_DEPTH);
    const features = computePositionFeatures(fen);

    // A terminal position (checkmate/stalemate) has no legal moves — mirrors
    // services/engine/src/analyze.ts's analyzePositionDetailed, which
    // likewise reports multiPv as however many lines actually came back (0
    // here) rather than throwing on the "positive" multiPv assumption that
    // only ever applies to positions that still have a move to make.
    if (features.availableMoves.length === 0) {
      return {
        analysis: { fen, depth, multiPv: 0, bestMove: null, eval: { cp: null, mateIn: null }, lines: [], features },
        usedFallback: false
      };
    }

    try {
      return { analysis: await this.analyzeViaChessApi(fen, depth, opts, features), usedFallback: false };
    } catch (error) {
      if (!this.fallback) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`ChessApiEngineBackend: falling back to native for fen "${fen}" — ${message}`);
      return { analysis: await this.fallback.analyzePosition(fen, opts), usedFallback: true };
    }
  }

  private async analyzeViaChessApi(
    fen: string,
    depth: number,
    opts: EngineBackendAnalyzeOptions | undefined,
    features: ReturnType<typeof computePositionFeatures>
  ): Promise<PositionAnalysis> {
    const variants = Math.min(opts?.multiPv ?? ENGINE_MULTI_PV, CHESS_API_MAX_VARIANTS);
    const raws = await this.request(fen, depth, variants);
    logVariantShortfall(raws.length, variants);

    // request() has already rejected (and retried past) any line missing the
    // fields read here — see isUsableLine — so raw.eval/raw.mate are trusted
    // as real numbers at this point.
    const lines = raws.map((raw) => ({
      moveUci: raw.move,
      moveSan: raw.san,
      pvSan: pvUciToSan(fen, [raw.move, ...(raw.continuationArr ?? [])]),
      cp: raw.mate !== null ? null : Math.round(raw.eval * 100),
      mateIn: raw.mate
    }));
    const best = lines[0];

    return {
      fen,
      depth,
      multiPv: lines.length,
      bestMove: best?.moveSan ?? null,
      eval: { cp: best?.cp ?? null, mateIn: best?.mateIn ?? null },
      lines,
      features
    };
  }

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const evals: EngineEval[] = [];
    for (const [ply, fen] of fens.entries()) {
      let analysis: PositionAnalysis;
      if (this.circuitOpen && this.fallback) {
        // Already established chess-api.com is down for this job — go
        // straight to native, no request, no retry delay, no pacing (native
        // isn't the thing being rate-limited).
        analysis = await this.fallback.analyzePosition(fen, opts);
      } else {
        if (ply > 0) await delay(this.requestDelayMs);
        analysis = await this.analyzeCountingFailures(fen, opts);
      }
      evals.push({ ...toLeanEval(analysis), ply });
    }
    return evals;
  }

  private async request(fen: string, depth: number, variants: number): Promise<ChessApiLine[]> {
    let malformedAttempt = 0;
    let rateLimitAttempt = 0;

    for (;;) {
      const lines = await this.requestOnceRetryingRateLimit(fen, depth, variants, () => rateLimitAttempt++);
      // lines.every(isUsableLine) is vacuously true for an empty array, so
      // the length check is required — otherwise a no-lines response (see
      // requestOnce) would be accepted as a "usable" empty result instead of
      // going through the same retry-then-fail path every other malformed
      // shape does.
      if (lines.length > 0 && lines.every(isUsableLine)) return lines;

      const retryDelayMs = MALFORMED_RESPONSE_RETRY_DELAYS_MS[malformedAttempt++];
      if (retryDelayMs === undefined) {
        throw new ChessApiMalformedResponseError(fen, lines.find((line) => !isUsableLine(line)));
      }
      await delay(retryDelayMs);
    }
  }

  /** Wraps requestOnce with its own independent retry track for a 429 —
   * distinct from `request()`'s own malformed-response retries above, since
   * "chess-api.com is actively throttling us" and "chess-api.com sent one
   * bad line" call for different backoffs and different give-up errors (see
   * RATE_LIMIT_RETRY_DELAYS_MS's doc comment). `nextRateLimitAttempt` reads
   * and bumps the caller's own counter rather than owning one locally, since
   * this needs to be called fresh on every malformed-response retry too
   * without resetting how many rate-limit retries have already happened. */
  private async requestOnceRetryingRateLimit(
    fen: string,
    depth: number,
    variants: number,
    nextRateLimitAttempt: () => number
  ): Promise<ChessApiLine[]> {
    for (;;) {
      try {
        return await this.requestOnce(fen, depth, variants);
      } catch (error) {
        if (!(error instanceof ChessApiError) || error.upstreamStatus !== 429) throw error;

        const retryDelayMs = RATE_LIMIT_RETRY_DELAYS_MS[nextRateLimitAttempt()];
        if (retryDelayMs === undefined) throw new ChessApiRateLimitedError(fen);
        console.warn(`ChessApiEngineBackend: rate-limited (429) for fen "${fen}" — retrying in ${retryDelayMs}ms`);
        await delay(retryDelayMs);
      }
    }
  }

  private async requestOnce(fen: string, depth: number, variants: number): Promise<ChessApiLine[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(CHESS_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fen, depth, variants }),
        signal: controller.signal
      });
      if (!response.ok) throw new ChessApiError(response.status);

      const body = (await response.json()) as ChessApiLine | ChessApiLine[];
      // An empty array is itself a malformed-but-200 shape (same undocumented
      // throttle behavior chess-api-response.ts's isUsableLine guards
      // against) — returned as-is rather than thrown here so request()'s
      // retry/backoff loop covers it the same way it covers any other
      // unusable line, instead of failing on the very first attempt.
      const lines = Array.isArray(body) ? body : [body];
      // Normalized before isUsableLine ever sees it — see
      // normalizeChessApiLine's own doc comment for why `mate` needs this.
      return lines.map(normalizeChessApiLine);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new EngineUnavailableError(`chess-api.com timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function logVariantShortfall(receivedLines: number, requestedVariants: number): void {
  if (hasLoggedVariantShortfall || receivedLines >= requestedVariants) return;

  hasLoggedVariantShortfall = true;
  console.info(
    `ChessApiEngineBackend: chess-api.com returned ${receivedLines} line${receivedLines === 1 ? '' : 's'} ` +
      `for ${requestedVariants} requested variant${requestedVariants === 1 ? '' : 's'}`
  );
}
