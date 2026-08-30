import { computePositionFeatures, pvUciToSan } from '@freechesscoach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH, type EngineEval, type PositionAnalysis } from '@freechesscoach/shared';
import { ENGINE_MULTI_PV } from '../engine-client.js';
import { EngineUnavailableError } from '../../lib/errors.js';
import { toLeanEval } from './caching-engine-backend.js';
import {
  ChessApiError,
  ChessApiMalformedResponseError,
  isUsableLine,
  MALFORMED_RESPONSE_RETRY_DELAYS_MS,
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

// analyzeGame trips the circuit after this many *consecutive* positions each
// needed the fallback — one bad position (still retried on its own, see
// MALFORMED_RESPONSE_RETRY_DELAYS_MS) isn't evidence the service is down,
// but this many in a row is. Once tripped, every remaining position in that
// batch skips chess-api.com entirely and goes straight to native — without
// this, a fully-down chess-api.com would pay a full retry-and-backoff cycle
// (~1s+) for every single position in the game before falling back.
const CIRCUIT_BREAKER_CONSECUTIVE_FAILURES = 3;

/**
 * Calls the free third-party https://chess-api.com/v1 HTTP API — from the
 * server only, never from the browser, so its evaluations are trusted the
 * same as the native backend's for position_evaluations cache purposes (see
 * resolve-engine-backend.ts's isExternalSource: false for 'chess_api').
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
 * `fallback`, when given, takes over one specific position if chess-api.com
 * can't produce a usable result for it (a non-2xx status, a timeout, or a
 * malformed response surviving all of request()'s retries) — the rest of
 * the user's session still runs on chess_api. This doesn't violate the
 * "no fallback, ever" rule elsewhere in this codebase (see
 * EngineUnavailableError's doc comment): that rule is about never silently
 * swapping a user's *chosen* engine identity for cache-correctness reasons,
 * but chess_api and native are already the same position_evaluations trust
 * tier (isExternalSource: false for both — see resolve-engine-backend.ts),
 * so substituting one for the other here doesn't introduce a new cache
 * inconsistency. Logged, not surfaced to the user or recorded on the
 * resulting analysis — deliberately silent, since either engine's result is
 * already treated as equally trustworthy. */
export class ChessApiEngineBackend implements EngineBackend {
  constructor(
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly requestDelayMs: number = 100,
    private readonly fallback?: EngineBackend
  ) {}

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    return (await this.analyzePositionWithFailover(fen, opts)).analysis;
  }

  /** Same as analyzePosition, but also reports whether it had to fall back —
   * analyzeGame uses that to run its circuit breaker (see
   * CIRCUIT_BREAKER_CONSECUTIVE_FAILURES); a standalone caller (this class's
   * own analyzePosition) has no "rest of the batch" to protect and doesn't
   * need it. */
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
    let consecutiveFailures = 0;
    let circuitOpen = false;

    for (const [ply, fen] of fens.entries()) {
      let analysis: PositionAnalysis;

      if (circuitOpen && this.fallback) {
        // Already established chess-api.com is down for this batch — go
        // straight to native, no request, no retry delay, no pacing (native
        // isn't the thing being rate-limited).
        analysis = await this.fallback.analyzePosition(fen, opts);
      } else {
        if (ply > 0) await delay(this.requestDelayMs);
        const result = await this.analyzePositionWithFailover(fen, opts);
        analysis = result.analysis;
        consecutiveFailures = result.usedFallback ? consecutiveFailures + 1 : 0;
        if (consecutiveFailures >= CIRCUIT_BREAKER_CONSECUTIVE_FAILURES) {
          circuitOpen = true;
          const remaining = fens.length - ply - 1;
          console.warn(
            `ChessApiEngineBackend: ${consecutiveFailures} consecutive failures — treating chess-api.com as down ` +
              `for the rest of this batch (${remaining} position${remaining === 1 ? '' : 's'} remaining), routing directly to native.`
          );
        }
      }

      evals.push({ ...toLeanEval(analysis), ply });
    }
    return evals;
  }

  private async request(fen: string, depth: number, variants: number): Promise<ChessApiLine[]> {
    for (let attempt = 0; ; attempt++) {
      const lines = await this.requestOnce(fen, depth, variants);
      // lines.every(isUsableLine) is vacuously true for an empty array, so
      // the length check is required — otherwise a no-lines response (see
      // requestOnce) would be accepted as a "usable" empty result instead of
      // going through the same retry-then-fail path every other malformed
      // shape does.
      if (lines.length > 0 && lines.every(isUsableLine)) return lines;

      const retryDelayMs = MALFORMED_RESPONSE_RETRY_DELAYS_MS[attempt];
      if (retryDelayMs === undefined) {
        throw new ChessApiMalformedResponseError(fen, lines.find((line) => !isUsableLine(line)));
      }
      await delay(retryDelayMs);
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
      return Array.isArray(body) ? body : [body];
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
