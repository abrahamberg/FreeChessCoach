import { afterEach, describe, expect, test, vi } from 'vitest';
import { providerEndpointOptions } from './provider-fetch.js';

describe('providerEndpointOptions', () => {
  afterEach(() => vi.restoreAllMocks());

  test('keeps Azure-style endpoint query parameters when the SDK appends its path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const options = providerEndpointOptions('https://azure.example/openai/deployments/terra?api-version=2024-10-21');

    expect(options.baseURL).toBe('https://azure.example/openai/deployments/terra');
    await options.fetch?.('https://azure.example/openai/deployments/terra/chat/completions', { method: 'POST' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://azure.example/openai/deployments/terra/chat/completions?api-version=2024-10-21'
    );
  });

  test('does not install a wrapper for an endpoint without a query', () => {
    expect(providerEndpointOptions('https://api.openai.com/v1')).toEqual({ baseURL: 'https://api.openai.com/v1' });
  });
});
