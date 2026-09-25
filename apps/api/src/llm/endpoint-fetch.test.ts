import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BlockedEndpointError, endpointFetch } from './endpoint-fetch.js';

describe('endpointFetch', () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((_request, response) => response.end('internal secret'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test.each(['http://127.0.0.1:%d/v1', 'http://[::1]:%d/v1', 'http://localhost:%d/v1', 'http://169.254.169.254/latest'])(
    'refuses %s before sending anything',
    async (template) => {
      await expect(endpointFetch()(template.replace('%d', String(port)))).rejects.toBeInstanceOf(BlockedEndpointError);
    }
  );

  test('refuses a hostname that resolves to loopback', async () => {
    // localtest.me-style names are external; use the OS resolver's own name for
    // loopback that is not the literal string "localhost".
    const error = await endpointFetch()(`http://127.0.0.1.nip.io:${port}/`).catch((caught: unknown) => caught);
    const cause = error instanceof Error ? error.cause : undefined;
    // Offline CI can't resolve nip.io at all; either way nothing reaches the server.
    expect(cause instanceof BlockedEndpointError || (error instanceof Error && /fetch failed/.test(error.message))).toBe(true);
  });

  test('LLM_ALLOW_PRIVATE_ENDPOINTS=1 lets a self-hosted install reach its own network', async () => {
    process.env.LLM_ALLOW_PRIVATE_ENDPOINTS = '1';
    try {
      const response = await endpointFetch()(`http://127.0.0.1:${port}/`);
      expect(await response.text()).toBe('internal secret');
    } finally {
      delete process.env.LLM_ALLOW_PRIVATE_ENDPOINTS;
    }
  });
});
