import { describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

describe('apiRateLimitPlugin', () => {
  test('caps all /api routes together per user, with Retry-After', async () => {
    const app = buildApp({ authMode: 'proxy', apiRateLimit: { max: 3, windowMs: 60_000 } });
    app.get('/api/a', async () => ({ ok: true }));
    app.get('/api/b', async () => ({ ok: true }));
    const get = (url: string, email = 'ann@example.com') => app.inject({ method: 'GET', url, headers: { 'x-forwarded-email': email } });

    expect((await get('/api/a')).statusCode).toBe(200);
    expect((await get('/api/b')).statusCode).toBe(200);
    expect((await get('/api/a')).statusCode).toBe(200);
    const limited = await get('/api/b');
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await get('/api/a', 'bob@example.com')).statusCode).toBe(200);
  });

  test('probes and the worker relay are not counted', async () => {
    const app = buildApp({ authMode: 'proxy', apiRateLimit: { max: 1, windowMs: 60_000 } });
    app.post('/internal/x', async () => ({ ok: true }));
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/internal/x' })).statusCode).toBe(200);
    }
  });
});
