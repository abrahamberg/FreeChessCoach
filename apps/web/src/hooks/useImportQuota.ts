import { ImportQuotaResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client.js';

/** The query key other code invalidates after an import or a delete. */
export const IMPORT_QUOTA_QUERY_KEY = ['import-quota'] as const;

/** GET /api/games/import-quota — every import limit in one read (daily,
 * weekly, in-flight, library). The rolling counts the backend enforces
 * (services/import-quota.ts), not "games with today's date". Shared by the
 * Games page's counter and the Import page's picker and delete-notice. */
export function useImportQuota() {
  return useQuery({
    queryKey: IMPORT_QUOTA_QUERY_KEY,
    queryFn: ({ signal }) => apiGet('/api/games/import-quota', ImportQuotaResponseSchema, signal)
  });
}
