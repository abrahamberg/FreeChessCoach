import { describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import { rateLimitConfig } from './route-rate-limit.js';

describe('rateLimitConfig', () => {
  test('caps an opted-in route per user with a 429 problem+json, leaving other users alone', async () => {
    const app = buildApp({ authMode: 'proxy' });
    app.post('/limited', rateLimitConfig({ max: 2, windowMs: 60_000 }), async () => ({ ok: true }));
    const as = (email: string) => ({ method: 'POST' as const, url: '/limited', headers: { 'x-forwarded-email': email } });

    expect((await app.inject(as('ann@example.com'))).statusCode).toBe(200);
    expect((await app.inject(as('ann@example.com'))).statusCode).toBe(200);
    const limited = await app.inject(as('ann@example.com'));
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
    expect((await app.inject(as('bob@example.com'))).statusCode).toBe(200);
  });

  test('routes without the config are not limited', async () => {
    const app = buildApp({ authMode: 'proxy' });
    app.post('/open', async () => ({ ok: true }));
    for (let i = 0; i < 20; i++) {
      const response = await app.inject({ method: 'POST', url: '/open', headers: { 'x-forwarded-email': 'ann@example.com' } });
      expect(response.statusCode).toBe(200);
    }
  });
});
