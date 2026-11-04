import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { resolveDisplayName } from '../lib/display-name.js';

export interface AuthUser {
  email: string;
  displayName: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export interface AuthHeadersOptions {
  authMode: 'proxy' | 'dev-stub';
  /** The course editor a bearer token stands for, or null (docs/courses.md §2). */
  tokenUser: (token: string) => Promise<AuthUser | null>;
}

// UserProfileSchema requires a real-shaped email (z.string().email()) — 'dev@local'
// has no TLD and fails that check on every frontend fetch of /api/users/me, so this
// uses .test (the IANA-reserved TLD for testing) instead.
const DEV_STUB_USER: AuthUser = { email: 'dev@local.test', displayName: 'dev@local.test' };

// architecture.md §11/§12: oauth2-proxy is configured with `--skip-auth-route` for
// each of these paths and never sets identity headers on them.
//   /healthz, /readyz — the k8s kubelet probes these directly, bypassing the proxy,
//     with no headers of any kind; requiring auth here would keep every pod out of
//     the Ready state (deploy/helm/freechesscoach api Deployment).
// /internal/* (checked separately below, not added to this set since it's a prefix
//   match rather than an exact path) — the worker process calls these directly, never
//   through oauth2-proxy, and is authenticated instead by a shared-secret
//   x-internal-token header (routes/engine-tunnel-internal.ts).
// /api/public/* — the published course page (docs/courses.md §9), skip-auth at
//   the proxy; its routes never read request.user. Judged by the route that
//   matched, not the raw URL, so no path trick ("/api/public/../courses")
//   reaches another route without identity.
// /api/token/* — the course API for course editors' tools (the studio):
//   skip-auth at the proxy, so it carries no identity headers; a bearer token
//   (services/courses/course-tokens.ts) is the only identity it takes, and no
//   other route reads one. Judged by the matched route, like /api/public/*.
const AUTH_EXEMPT_PATHS = new Set(['/healthz', '/readyz']);
export const PUBLIC_API_PREFIX = '/api/public/';
export const TOKEN_API_PREFIX = '/api/token/';

/** Decorates `request.user` from oauth2-proxy identity headers.
 *
 * Only the `X-Forwarded-*` user headers are trusted. oauth2-proxy (reverse-proxy
 * mode, `pass_user_headers`) deletes any client-sent copy of exactly these and
 * sets them from the session. `X-Auth-Request-*` are *response* headers for
 * nginx auth_request mode; oauth2-proxy never strips them from requests, so a
 * signed-in user could send `X-Auth-Request-Email: someone@else` and it would
 * reach this process untouched. Never read them here. */
export const authHeadersPlugin: FastifyPluginAsync<AuthHeadersOptions> = fp(
  (app: FastifyInstance, opts: AuthHeadersOptions) => {
    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      if (AUTH_EXEMPT_PATHS.has(request.url) || request.url.startsWith('/internal/') || isPublicRoute(request)) return;
      if (isTokenRoute(request)) {
        await authenticateToken(request, reply, opts);
        return;
      }

      const user = userFromHeaders(request);
      if (user) {
        request.user = user;
        return;
      }
      if (opts.authMode === 'dev-stub') {
        request.user = DEV_STUB_USER;
        return;
      }
      await reply.code(401).type('application/problem+json').send({
        type: 'about:blank',
        title: 'Missing authentication headers',
        status: 401
      });
    });

    return Promise.resolve();
  }
);

/** A token route: the bearer token's editor, or 401. Without a token the
 * dev stub stands in, as it does for every other route. */
async function authenticateToken(request: FastifyRequest, reply: FastifyReply, opts: AuthHeadersOptions): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await opts.tokenUser(token) : null;
  if (user) {
    request.user = user;
    return;
  }
  if (!token && opts.authMode === 'dev-stub') {
    request.user = DEV_STUB_USER;
    return;
  }
  await reply.code(401).type('application/problem+json').send({ type: 'about:blank', title: 'Missing or invalid course API token', status: 401 });
}

function bearerToken(request: FastifyRequest): string | null {
  const header = firstHeaderValue(request.headers.authorization);
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function userFromHeaders(request: FastifyRequest): AuthUser | null {
  const email = firstHeaderValue(request.headers['x-forwarded-email']);
  if (!email) return null;

  // x-forwarded-preferred-username carries a real username claim when the
  // provider sends one; x-forwarded-user is the legacy field (see
  // lib/display-name.ts for why it is untrustworthy on its own for Google logins).
  const displayName = resolveDisplayName({
    preferredUsername: firstHeaderValue(request.headers['x-forwarded-preferred-username']),
    legacyUser: firstHeaderValue(request.headers['x-forwarded-user']),
    email
  });
  return { email, displayName };
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function isPublicRoute(request: FastifyRequest): boolean {
  return request.routeOptions.url?.startsWith(PUBLIC_API_PREFIX) ?? false;
}

function isTokenRoute(request: FastifyRequest): boolean {
  return request.routeOptions.url?.startsWith(TOKEN_API_PREFIX) ?? false;
}
