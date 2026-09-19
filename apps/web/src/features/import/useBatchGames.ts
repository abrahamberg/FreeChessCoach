import { ImportedGamesPageSchema, type ImportedGameItem } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

const POLL_MS = 2000;
/** The newest imports come first, so a just-imported batch (at most
 * `MAX_IN_FLIGHT_IMPORTS`) is always within this many. */
const RECENT_LIMIT = 50;

/** Anything but queued / running / planning / paused. No analysis at all
 * (null) counts as done: there is nothing left to wait for. */
export function isAnalysisFinished(status: ImportedGameItem['analysisStatus']): boolean {
  return status === null || status === 'ready' || status === 'failed';
}

/** Follows a just-imported batch's analysis by polling the recent-imports
 * list — one request for every game, instead of one SSE connection each
 * (browsers cap those at about six per origin). Stops polling once every game
 * is finished. A game missing from the list (deleted meanwhile) is simply
 * absent from `games`; it never holds the poll open. */
export function useBatchGames(gameIds: string[]) {
  const wanted = new Set(gameIds);
  const query = useQuery({
    queryKey: ['batch-games', ...gameIds],
    queryFn: async ({ signal }) => {
      const page = await apiGet(`/api/games/imported?limit=${RECENT_LIMIT}`, ImportedGamesPageSchema, signal);
      return page.items.filter((item) => wanted.has(item.id));
    },
    refetchInterval: (current) => (current.state.data?.every((game) => isAnalysisFinished(game.analysisStatus)) ? false : POLL_MS)
  });

  const games = query.data ?? [];
  return { games, isLoaded: query.isSuccess, allFinished: query.isSuccess && games.every((game) => isAnalysisFinished(game.analysisStatus)) };
}
