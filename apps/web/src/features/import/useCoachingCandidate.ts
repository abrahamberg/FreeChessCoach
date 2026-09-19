import { CoachingCandidateResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

/** GET /api/games/coaching-candidate — the batch's most tactical analyzed
 * game (programmatic, no AI). Asked once, when the whole batch has finished
 * analyzing, so the pick is over every game that will ever be ready. */
export function useCoachingCandidate(gameIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['coaching-candidate', ...gameIds],
    queryFn: ({ signal }) => apiGet(`/api/games/coaching-candidate?gameIds=${gameIds.join(',')}`, CoachingCandidateResponseSchema, signal),
    enabled: enabled && gameIds.length > 0
  });
}
