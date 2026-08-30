import { HttpError } from '../../lib/errors.js';

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
 * this request right now", not a client mistake. */
export class ChessApiError extends HttpError {
  readonly status = 503;
  constructor(httpStatus: number) {
    super(`chess-api.com request failed with status ${httpStatus}`);
  }
}

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
// short growing backoff — chess-api.com doesn't document a rate limit, but a
// malformed response has so far only been seen mid-way through a rapid
// sequential run (analyzeGame's one-request-per-position loop, no pacing
// between them), which is the classic shape of an undocumented throttle that
// degrades the response instead of returning a proper 429.
export const MALFORMED_RESPONSE_RETRY_DELAYS_MS = [250, 750];

export function isUsableLine(raw: ChessApiLine): boolean {
  if (typeof raw.move !== 'string' || raw.move.length === 0) return false;
  if (typeof raw.san !== 'string' || raw.san.length === 0) return false;
  if (raw.mate !== null && !Number.isFinite(raw.mate)) return false;
  if (raw.mate === null && !Number.isFinite(raw.eval)) return false;
  return true;
}
