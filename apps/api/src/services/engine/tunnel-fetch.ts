import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import { EngineUnavailableError } from '../../lib/errors.js';

interface TunnelHttpFetchResult {
  status: number;
  body: string;
}

/**
 * Wraps a browser tunnel connection as a `fetch`-compatible function, for
 * ChessApiEngineBackend's `fetchImpl` — reaches chess-api.com through the
 * user's own connected tab (see useEngineTunnelClient.ts's 'http-fetch'
 * handler) instead of this server, so requests land on chess-api.com from
 * each user's own IP rather than piling onto the server's, which is what a
 * shared free-tier third party actually rate-limits on.
 *
 * Tunnel-only, always — this server never calls chess-api.com directly
 * itself any more, in interactive routes or background jobs alike: rejects
 * with EngineUnavailableError instead of a response the instant the tunnel
 * isn't connected or doesn't answer in `timeoutMs`. resolve-engine-backend.ts
 * still gives an interactive caller a *different* engine (native) as its
 * fallback when this rejects — this file's only job is making sure that
 * fallback is never "this server asked chess-api.com itself".
 *
 * Because a result now always comes from the browser, resolve-engine-
 * backend.ts marks chess_api the same `isExternalSource: true` tier as
 * browser mode — see its own comment.
 */
export function createTunnelFetch(transport: EngineTunnelTransport, userId: string, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;

    try {
      const raw = await transport.request(userId, { kind: 'http-fetch', url, method, body }, timeoutMs);
      const { status, body: responseBody } = raw as TunnelHttpFetchResult;
      return new Response(responseBody, { status });
    } catch (error) {
      throw error instanceof Error ? new EngineUnavailableError(error.message) : error;
    }
  };
}
