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
const AUTH_EXEMPT_PATHS = new Set(['/healthz', '/readyz']);

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
      if (AUTH_EXEMPT_PATHS.has(request.url) || request.url.startsWith('/internal/')) return;

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
