import { CloudModelsResponseSchema, type KnownCloudProvider } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiPost } from '../../api/client.js';
import { useDebounced } from './useLocalModels.js';

const DEBOUNCE_MS = 600;

/** A named provider's models, listed by the server with the typed key (which
 * also checks it). With `useSavedKey` and no typed key, the server uses the
 * unlocked saved setup's key instead — it never comes back to the browser. */
export function useCloudModels(provider: KnownCloudProvider | null, apiKey: string, useSavedKey = false) {
  const debouncedKey = useDebounced(apiKey.trim(), DEBOUNCE_MS);
  return useQuery({
    queryKey: ['cloud-models', provider, debouncedKey, useSavedKey],
    queryFn: () =>
      apiPost('/api/users/me/llm-setup/cloud-models', { provider, apiKey: debouncedKey || undefined }, CloudModelsResponseSchema),
    enabled: provider !== null && (debouncedKey !== '' || useSavedKey),
    retry: false,
    staleTime: 60_000
  });
}
