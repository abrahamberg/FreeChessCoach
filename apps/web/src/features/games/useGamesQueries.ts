import {
  GameListResponseSchema,
  IMPORTED_GAMES_STRIP_SIZE,
  ImportedGamesPageSchema
} from '@freechesscoach/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiGet } from '../../api/client.js';
import { useActiveAnalyses } from '../../hooks/useActiveAnalyses.js';

/** Every games query lives under the ['games', ...] key prefix, so one
 * `invalidateQueries({ queryKey: ['games'] })` refreshes the Continue rail,
 * the Recently imported rail and Find games' list together. */

/** The Continue rail: live coach/bot sessions only. */
export function useInProgressGames() {
  return useQuery({
    queryKey: ['games', 'in-progress'],
    queryFn: ({ signal }) => apiGet('/api/games/in-progress', GameListResponseSchema, signal)
  });
}

/** The Recently imported rail: the last 15 imports, newest first. */
export function useRecentImportedGames() {
  return useQuery({
    queryKey: ['games', 'recent'],
    queryFn: ({ signal }) =>
      apiGet(`/api/games/imported?limit=${IMPORTED_GAMES_STRIP_SIZE}`, ImportedGamesPageSchema, signal)
  });
}

/** A row stuck on "Analyzing…" used to only ever clear on a manual reload or
 * a window-focus refetch — nothing on the page learned that a background
 * analysis had finished. GET /api/analyses/active (SSE) already pushes every
 * in-progress analysis to the AppShell topbar indicator; reused here. It
 * only reports *in-progress* analyses, so the terminal status itself isn't
 * in the frame — the moment a gameId drops out of that list is the signal to
 * refetch the games queries once. */
export function useRefreshGamesWhenAnalysisFinishes(): void {
  const queryClient = useQueryClient();
  const { analyses: activeAnalyses } = useActiveAnalyses();
  const previouslyActiveGameIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentlyActiveGameIds = new Set(activeAnalyses.map((analysis) => analysis.gameId));
    const justFinished = [...previouslyActiveGameIdsRef.current].some((gameId) => !currentlyActiveGameIds.has(gameId));
    previouslyActiveGameIdsRef.current = currentlyActiveGameIds;
    if (justFinished) void queryClient.invalidateQueries({ queryKey: ['games'] });
  }, [activeAnalyses, queryClient]);
}
