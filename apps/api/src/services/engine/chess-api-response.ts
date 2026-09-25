import { EngineUnavailableError, HttpError } from '../../lib/errors.js';

export interface ChessApiLine {
  move: string;
  san: string;
  eval: number;
  mate: number | null;
  continuationArr?: string[];
}

/** Thrown when chess-api.com itself responds with a non-2xx status — the
 * request-level failure `chess-api-engine-backend.ts`'s `requestOnce`
 * catches. 503 (same as EngineUnavailableError) since it means "can't serve
 * this request right now", not a client mistake. `upstreamStatus` is chess-
 * api.com's own status (as opposed to this error's own `status`, always
 * 503) — `request()`'s retry loop reads it to single out 429 for its own
 * rate-limit backoff (see RATE_LIMIT_RETRY_DELAYS_MS) instead of treating it
 * the same as a genuine 5xx. */
export class ChessApiError extends HttpError {
  readonly status = 503;
  constructor(readonly upstreamStatus: number) {
    super(`chess-api.com request failed with status ${upstreamStatus}`);
  }
}

/** Thrown once RATE_LIMIT_RETRY_DELAYS_MS is exhausted against a persistent
 * 429 from chess-api.com. Extends EngineUnavailableError (not ChessApiError)
 * on purpose — this is a request that could genuinely no longer be served,
 * not a data-shape problem — so it's picked up for free by the two places
 * that already know how to react to that: ChessApiEngineBackend's own
 * `fallback` (the shared engine pipeline's next reliable stage — see its own
 * doc comment) and jobs/analyze-game.ts's runAnalyzeGameJob, which records an
 * exhausted pipeline instead of treating the upstream response as a valid
 * evaluation. Pausing isn't a perfect
 * answer here (unlike a dropped tunnel, chess-api.com being rate-limited
 * doesn't reliably clear the moment the tunnel reconnects — routes/engine-
 * tunnel.ts's resume trigger), but RATE_LIMIT_RETRY_DELAYS_MS is long enough
 * that a background job should only ever see this after riding out a
 * short-lived throttle window has already failed. */
export class ChessApiRateLimitedError extends EngineUnavailableError {
  constructor(fen: string) {
    super(`chess-api.com rate-limited this request for FEN "${fen}"`);
  }
}

/** chess-api.com's "too many requests today for this IP / key" answer:
 * `{ type: 'error', error: 'HIGH_USAGE', text }`. Unlike a 429 it is a daily
 * quota, so retrying within the job is pointless — it is never retried, and
 * the caller records it (see ChessApiEngineBackend's onHighUsage). Extends
 * EngineUnavailableError so the native fallback picks the request up. */
export class ChessApiHighUsageError extends EngineUnavailableError {
  constructor() {
    super('chess-api.com reported HIGH_USAGE (daily limit reached for this connection)');
  }
}

export function isHighUsageBody(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  return (body as { type?: unknown }).type === 'error' && (body as { error?: unknown }).error === 'HIGH_USAGE';
}

// chess-api.com's free tier documents no rate limit, but 429s have been
// observed in bursts of real traffic. Three retries with a growing backoff
// (12s total) is long enough to typically ride out a short throttle window
// within a single request — most callers should never actually see
// ChessApiRateLimitedError. Deliberately longer than
// MALFORMED_RESPONSE_RETRY_DELAYS_MS below: that one is recovering from a
// one-off glitch, this one is waiting out an active throttle.
export const RATE_LIMIT_RETRY_DELAYS_MS = [1000, 3000, 8000];

/** Thrown when chess-api.com responds 200 OK but the body doesn't have the
 * fields a real evaluation line needs (observed once in production: a line
 * with no `move`/`san` and neither `eval` nor `mate` — chess-api.com's
 * undocumented API returns *some* 200 body even when it can't evaluate,
 * rather than a non-2xx status `requestOnce` would already catch). Only
 * thrown after `request()`'s retries (see MALFORMED_RESPONSE_RETRY_DELAYS_MS)
 * are exhausted — instead of silently mapping the missing fields to
 * null/NaN, a repeat failure surfaces as a normal analysis error rather than
 * a permanently-cached bad row (engine-backend-boundary design: fail fast,
 * never silently substitute). 503 for the same reason as ChessApiError. */
export class ChessApiMalformedResponseError extends HttpError {
  readonly status = 503;
  constructor(fen: string, raw: unknown) {
    super(`chess-api.com returned a malformed line for FEN "${fen}": ${JSON.stringify(raw)}`);
  }
}

// Two retries (three attempts total) on a malformed-but-200 response, with a
// short growing backoff — a malformed response has so far only been seen
// mid-way through a rapid sequential run (analyzeGame's one-request-per-
// position loop, no pacing between them), the classic shape of an
// undocumented throttle that sometimes degrades the response instead of a
// proper 429 (see RATE_LIMIT_RETRY_DELAYS_MS above for when it does send one).
export const MALFORMED_RESPONSE_RETRY_DELAYS_MS = [250, 750];

/**
 * chess-api.com's `mate` field is declared `number | null` on ChessApiLine,
 * but has been observed on the wire as a numeric *string* ("9") on the exact
 * same field a normal response reports as a number (9) — same API, same
 * shape, just inconsistent about that one field's JSON type. Normalizing it
 * once, right after the response is parsed (chess-api-engine-backend.ts's
 * requestOnce), means every downstream reader — isUsableLine included — can
 * trust ChessApiLine.mate's declared type instead of re-deriving this
 * coercion itself. A non-numeric string still becomes NaN, which
 * Number.isFinite below correctly still treats as unusable — this only
 * rescues a *valid* mate score the wire happened to quote.
 */
export function normalizeChessApiLine(raw: ChessApiLine): ChessApiLine {
  if (typeof raw.mate !== 'string') return raw;
  return { ...raw, mate: Number(raw.mate) };
}

export function isUsableLine(raw: ChessApiLine): boolean {
  if (typeof raw.move !== 'string' || raw.move.length === 0) return false;
  if (typeof raw.san !== 'string' || raw.san.length === 0) return false;
  if (raw.mate !== null && !Number.isFinite(raw.mate)) return false;
  if (raw.mate === null && !Number.isFinite(raw.eval)) return false;
  return true;
}
