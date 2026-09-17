import { describe, expect, test, vi } from 'vitest';
import { EngineUnavailableError } from '../../lib/errors.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import { createTunnelFetch } from './tunnel-fetch.js';

describe('createTunnelFetch', () => {
  test('sends an http-fetch request over the tunnel and wraps the result as a Response', async () => {
    const transport: EngineTunnelTransport = {
      request: vi.fn().mockResolvedValue({ status: 200, body: JSON.stringify({ ok: true }) })
    };
    const tunnelFetch = createTunnelFetch(transport, 'user-1', 5000);

    const response = await tunnelFetch('https://chess-api.com/v1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fen: 'x' })
    });

    expect(transport.request).toHaveBeenCalledWith(
      'user-1',
      { kind: 'http-fetch', url: 'https://chess-api.com/v1', method: 'POST', body: JSON.stringify({ fen: 'x' }) },
      5000
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('never calls anything but the tunnel — rejects with EngineUnavailableError when it rejects (no connection, or timed out)', async () => {
    const transport: EngineTunnelTransport = { request: vi.fn().mockRejectedValue(new Error('No tunnel connection')) };
    const tunnelFetch = createTunnelFetch(transport, 'user-1', 5000);

    await expect(tunnelFetch('https://chess-api.com/v1', { method: 'POST' })).rejects.toThrow(EngineUnavailableError);
  });

  test('rejects with EngineUnavailableError when the tunnel resolves with an unusable shape', async () => {
    const transport: EngineTunnelTransport = { request: vi.fn().mockResolvedValue(undefined) };
    const tunnelFetch = createTunnelFetch(transport, 'user-1', 5000);

    await expect(tunnelFetch('https://chess-api.com/v1', { method: 'POST' })).rejects.toThrow(EngineUnavailableError);
  });
});
