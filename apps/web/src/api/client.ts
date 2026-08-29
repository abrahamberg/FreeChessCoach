import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** React Query's default retry (up to 3x, growing delay) assumes a thrown
 * queryFn error is transient — true for a dropped connection or a 5xx, but
 * not for a ZodError (the response parsed fine, its *shape* is wrong — the
 * refetch will get byte-for-byte the same body and fail identically) or a
 * 4xx ApiError (also deterministic: the request itself is wrong). Retrying
 * either just multiplies a permanent failure into several seconds of visible
 * "Loading…" for nothing. Pass as `retry` in a query's (or the QueryClient's
 * defaultOptions) options. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ZodError) return false;
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 3;
}

/** Fetches `path`, parsing the JSON body against `schema`. Extra/unknown
 * response fields are tolerated (zod's default "strip" parsing), so the
 * client doesn't break when the API adds fields the UI doesn't use yet.
 *
 * `signal` should be forwarded from React Query's queryFn context
 * (`({signal}) => apiGet(path, schema, signal)`) — otherwise React 18
 * StrictMode's dev-only double-mount cancels the first fetch without this
 * function ever seeing it, leaving the query stuck pending/paused forever. */
// `any` in the Def/Input slots is load-bearing, not laziness: zod's `Input` type
// for a schema with a `.default(...)` field (e.g. ClassifiedMoveSchema's
// hangsPiece) makes that key optional, and pinning Input to T here would let
// that optionality leak into the inferred T via property-position inference —
// callers would see `hangsPiece?: boolean` instead of `hangsPiece: boolean`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiGet<T>(path: string, schema: ZodType<T, any, any>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'include', signal });
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} failed with ${response.status}`, await safeJson(response));
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see apiGet above
export async function apiPost<T>(path: string, payload: unknown, schema: ZodType<T, any, any>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new ApiError(response.status, `POST ${path} failed with ${response.status}`, await safeJson(response));
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see apiGet above
export async function apiPatch<T>(path: string, payload: unknown, schema: ZodType<T, any, any>): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new ApiError(response.status, `PATCH ${path} failed with ${response.status}`, await safeJson(response));
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}

/** PUT/DELETE endpoints in this app return 204 No Content (e.g. llm-keys) — no schema to parse. */
export async function apiPut(path: string, payload: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new ApiError(response.status, `PUT ${path} failed with ${response.status}`, await safeJson(response));
  }
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(path, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) {
    throw new ApiError(response.status, `DELETE ${path} failed with ${response.status}`, await safeJson(response));
  }
}

/** Problem+json error bodies (e.g. {missing: 'userColor'}) carry data callers
 * need; best-effort since not every error response has a JSON body. */
async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
