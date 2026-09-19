import { LlmSetupStatusSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client.js';

/** The caller's BYOK setup status — shared with Settings (same query key, so
 * saving a key there refreshes every gate that reads this). `configured` is
 * false until the student has saved a provider key at all. */
export function useLlmSetupStatus() {
  return useQuery({
    queryKey: ['llm-setup'],
    queryFn: ({ signal }) => apiGet('/api/users/me/llm-setup', LlmSetupStatusSchema, signal)
  });
}
