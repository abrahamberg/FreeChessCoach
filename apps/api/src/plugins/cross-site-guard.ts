import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Refuses state-changing requests (and WebSocket handshakes, which carry
 * cookies and aren't covered by CORS) that a browser says came from another
 * site. The session is an oauth2-proxy cookie, so without this a page on any
 * other site could make a signed-in visitor's browser POST here, or open
 * /api/tunnel and receive that user's coach prompts.
 *
 * Sec-Fetch-Site is sent by every current browser and can't be set by page
 * script; Origin is the fallback for older ones. Requests with neither (the
 * worker, curl, the capture scripts) aren't from a browser and pass. */
export const crossSiteGuardPlugin = fp((app: FastifyInstance) => {
  app.addHook('onRequest', async (request) => {
    if (!needsSameOriginCheck(request)) return;
    if (isCrossSite(request)) throw new ForbiddenError('Cross-site request refused');
  });
  return Promise.resolve();
});

function needsSameOriginCheck(request: FastifyRequest): boolean {
  if (request.url.startsWith('/internal/')) return false;
  return !SAFE_METHODS.has(request.method) || isWebSocketUpgrade(request);
}

function isWebSocketUpgrade(request: FastifyRequest): boolean {
  return request.headers.upgrade?.toLowerCase() === 'websocket';
}

function isCrossSite(request: FastifyRequest): boolean {
  const fetchSite = request.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string') return fetchSite === 'cross-site' || fetchSite === 'same-site';

  const origin = request.headers.origin;
  if (origin === undefined) return false;
  return originHost(origin) !== requestHost(request);
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null; // includes the literal "null" origin of sandboxed frames
  }
}

function requestHost(request: FastifyRequest): string | undefined {
  const forwarded = request.headers['x-forwarded-host'];
  const host = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.headers.host;
  return host?.toLowerCase();
}
