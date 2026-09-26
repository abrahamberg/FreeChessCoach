import { LlmModelsResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client.js';

const DEBOUNCE_MS = 500;

/** The local server's models, fetched by the server through this tab's
 * tunnel. Keyed on the endpoint and token (both debounced while being typed),
 * so changing LM Studio ↔ Ollama refetches from the new port without firing
 * a request per keystroke. */
export function useLocalModels(endpoint: string, token: string, enabled: boolean) {
  const debouncedEndpoint = useDebounced(endpoint, DEBOUNCE_MS);
  const debouncedToken = useDebounced(token, DEBOUNCE_MS);
  return useQuery({
    queryKey: ['local-models', debouncedEndpoint, debouncedToken],
    queryFn: () =>
      apiPost(
        '/api/users/me/llm-setup/models',
        { endpoint: debouncedEndpoint, token: debouncedToken || undefined },
        LlmModelsResponseSchema
      ),
    enabled: enabled && isUrl(debouncedEndpoint),
    retry: false,
    staleTime: 10_000
  });
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function isUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
