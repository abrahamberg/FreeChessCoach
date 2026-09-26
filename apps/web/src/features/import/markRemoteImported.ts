import type { InfiniteData, QueryClient } from '@tanstack/react-query';

/** The Lichess / Chess.com picker lists, as `useRemoteImport` caches them. */
export const REMOTE_LIST_QUERY_KEYS = [['lichess-recent-games'], ['chesscom-recent-games']] as const;

/** Ticks a just-imported game as "Already imported" in the cached picker
 * lists. They are cached for minutes (a refetch calls Lichess / Chess.com
 * for every loaded page), so without this the tick only showed up once the
 * cache went stale. Matches by PGN, as the server's own check does
 * (gamesRepo.findImportedPgns). */
export function markRemoteGameImported(queryClient: QueryClient, pgn: string): void {
  for (const queryKey of REMOTE_LIST_QUERY_KEYS) {
    queryClient.setQueryData<InfiniteData<{ pgn: string; imported?: boolean }[]>>(queryKey, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) =>
              page.some((game) => game.pgn === pgn && !game.imported)
                ? page.map((game) => (game.pgn === pgn ? { ...game, imported: true } : game))
                : page
            )
          }
        : data
    );
  }
}
