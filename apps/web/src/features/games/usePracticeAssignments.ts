import { PuzzleAssignmentListResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

/** docs/plan.md Phase 59, Task 59.6 — the caller's own open puzzle
 * assignments (background-created by Task 59.3's profile-rebuild job), for
 * PracticeCard's "Practice ready" listing. A separate query from
 * useDashboard's /api/users/me/dashboard, same "distinct, optional-to-load
 * section" reasoning useDiagnostics.ts already documents — a student with
 * no assignments yet still gets a fully working dashboard. */
export function usePracticeAssignments() {
  return useQuery({
    queryKey: ['puzzle-assignments'],
    queryFn: ({ signal }) => apiGet('/api/puzzle-assignments', PuzzleAssignmentListResponseSchema, signal)
  });
}
