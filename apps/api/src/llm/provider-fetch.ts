import type { FetchFunction } from '@ai-sdk/provider-utils';
import { endpointFetch } from './endpoint-fetch.js';

/** Splits a user endpoint into the SDK's path prefix and a query-preserving
 * fetch wrapper. Azure OpenAI commonly puts its required api-version in the
 * endpoint query, while the SDK appends /chat/completions or /responses after
 * the configured base URL. Always goes through endpointFetch (public
 * addresses only). */
export function providerEndpointOptions(endpoint: string): { baseURL: string; fetch: FetchFunction } {
  const endpointUrl = new URL(endpoint);
  const baseURL = `${endpointUrl.origin}${endpointUrl.pathname.replace(/\/$/, '')}`;
  const fetch = endpointFetch();
  if (!endpointUrl.search) return { baseURL, fetch };

  return {
    baseURL,
    fetch: (input, init) => {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input));
      requestUrl.search = endpointUrl.search;
      requestUrl.hash = '';
      if (input instanceof Request) return fetch(new Request(requestUrl, input), init);
      return fetch(requestUrl, init);
    }
  };
}
