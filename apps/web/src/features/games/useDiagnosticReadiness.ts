import { DiagnosticReadinessResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

/** Progress toward the rated-game minimum the coach's pattern tracking
 * needs. Refetches on page mount (default staleTime), so returning from an
 * import shows the new count. */
export function useDiagnosticReadiness() {
  return useQuery({
    queryKey: ['diagnostic-readiness'],
    queryFn: ({ signal }) => apiGet('/api/users/me/diagnostics/readiness', DiagnosticReadinessResponseSchema, signal)
  });
}
