import { describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

function appWithRoutes() {
  const app = buildApp({ authMode: 'proxy' });
  app.post('/api/thing', async () => ({ ok: true }));
  app.get('/api/thing', async () => ({ ok: true }));
  return app;
}

const signedIn = { 'x-forwarded-email': 'ann@example.com', host: 'coach.example.com' };

describe('crossSiteGuardPlugin', () => {
  test.each(['cross-site', 'same-site'])('refuses a POST the browser marks %s', async (site) => {
    const response = await appWithRoutes().inject({ method: 'POST', url: '/api/thing', headers: { ...signedIn, 'sec-fetch-site': site } });
    expect(response.statusCode).toBe(403);
  });

  test.each(['same-origin', 'none'])('allows a POST the browser marks %s', async (site) => {
    const response = await appWithRoutes().inject({ method: 'POST', url: '/api/thing', headers: { ...signedIn, 'sec-fetch-site': site } });
    expect(response.statusCode).toBe(200);
  });

  test('refuses a cross-site WebSocket handshake', async () => {
    const response = await appWithRoutes().inject({
      method: 'GET',
      url: '/api/thing',
      headers: { ...signedIn, upgrade: 'websocket', connection: 'Upgrade', 'sec-fetch-site': 'cross-site' }
    });
    expect(response.statusCode).toBe(403);
  });

  test('allows a cross-site plain GET (reads are protected by CORS, links must work)', async () => {
    const response = await appWithRoutes().inject({ method: 'GET', url: '/api/thing', headers: { ...signedIn, 'sec-fetch-site': 'cross-site' } });
    expect(response.statusCode).toBe(200);
  });

  test('without Sec-Fetch-Site, falls back to comparing Origin with Host', async () => {
    const app = appWithRoutes();
    const foreign = await app.inject({ method: 'POST', url: '/api/thing', headers: { ...signedIn, origin: 'https://evil.example' } });
    const own = await app.inject({ method: 'POST', url: '/api/thing', headers: { ...signedIn, origin: 'https://coach.example.com' } });
    const sandboxed = await app.inject({ method: 'POST', url: '/api/thing', headers: { ...signedIn, origin: 'null' } });
    expect([foreign.statusCode, own.statusCode, sandboxed.statusCode]).toEqual([403, 200, 403]);
  });

  test('non-browser callers (no Sec-Fetch-Site, no Origin) pass', async () => {
    const response = await appWithRoutes().inject({ method: 'POST', url: '/api/thing', headers: signedIn });
    expect(response.statusCode).toBe(200);
  });
});
