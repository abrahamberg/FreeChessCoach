import { DiagnosticEvidenceResponseSchema, type DiagnosisCodeId } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

/** Task 58.1's evidence drill-down for one diagnosis code — `code === null`
 * (the modal not open yet) disables the query rather than fetching
 * speculatively. */
export function useDiagnosticEvidence(code: DiagnosisCodeId | null) {
  return useQuery({
    queryKey: ['diagnostic-evidence', code],
    queryFn: ({ signal }) => apiGet(`/api/users/me/diagnostics/${code}/evidence`, DiagnosticEvidenceResponseSchema, signal),
    enabled: code !== null
  });
}
