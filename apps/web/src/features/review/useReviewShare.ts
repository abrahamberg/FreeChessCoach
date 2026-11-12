import { ReviewShareStateSchema } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../api/client.js';

/** The address a shared review is passed around by: the server's preview
 * page (`/s/<token>`), which forwards a person to `/shared/<token>`. */
export function shareLinkUrl(token: string, origin: string): string {
  return `${origin}/s/${token}`;
}

/** One stored game's share link (growth plan A6): whether it is on, and
 * turning it on or off. */
export function useReviewShare(gameId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['review-share', gameId];
  const state = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiGet(`/api/games/${gameId}/share`, ReviewShareStateSchema, signal)
  });
  const share = useMutation({
    mutationFn: () => apiPost(`/api/games/${gameId}/share`, {}, ReviewShareStateSchema),
    onSuccess: (next) => queryClient.setQueryData(queryKey, next)
  });
  const stop = useMutation({
    mutationFn: () => apiDelete(`/api/games/${gameId}/share`),
    onSuccess: () => queryClient.setQueryData(queryKey, { token: null })
  });
  return {
    token: state.data?.token ?? null,
    isLoading: state.isPending,
    share: () => share.mutate(),
    stop: () => stop.mutate(),
    isBusy: share.isPending || stop.isPending,
    failed: share.isError || stop.isError
  };
}
