import { UserProfileSchema, type UpdateUserProfileRequest, type UserProfile } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../api/client.js';

export function useProfile(): UseQueryResult<UserProfile> {
  return useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal),
    // Picks up a chess-api.com rate limit recorded server-side mid-analysis.
    refetchInterval: 60_000
  });
}

/** PATCH /api/users/me with any subset of the profile; the cached profile is
 * replaced by the server's answer. */
export function useUpdateProfile(): UseMutationResult<UserProfile, Error, UpdateUserProfileRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateUserProfileRequest) => apiPatch('/api/users/me', patch, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });
}
