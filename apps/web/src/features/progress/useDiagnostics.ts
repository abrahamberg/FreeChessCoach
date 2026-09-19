import { DiagnosticsResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

/** Task 58.1's stored profile, auto-picked for the user's most recently
 * computed time control (no `?timeControl=` — the dashboard has no
 * time-control selector). Kept as a separate query from `useDashboard`'s
 * `/api/users/me/dashboard` (not merged server-side) since it's a distinct,
 * optional-to-load section: a fresh user with no stored profile yet still
 * gets a fully working dashboard. */
export function useDiagnostics() {
  return useQuery({
    queryKey: ['diagnostics'],
    queryFn: ({ signal }) => apiGet('/api/users/me/diagnostics', DiagnosticsResponseSchema, signal)
  });
}
