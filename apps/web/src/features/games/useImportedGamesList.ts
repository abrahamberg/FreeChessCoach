import { IMPORTED_GAMES_PAGE_SIZE, ImportedGamesPageSchema, type StatsRange } from '@freechesscoach/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';
import { findRatingBand } from './ratingBands.js';

export interface ImportedGamesFilters {
  range: StatsRange;
  ratingBandKey: string;
}

function pageUrl(filters: ImportedGamesFilters, offset: number): string {
  const params = new URLSearchParams({
    limit: String(IMPORTED_GAMES_PAGE_SIZE),
    offset: String(offset),
    range: filters.range
  });
  const band = findRatingBand(filters.ratingBandKey);
  if (band.minRating !== undefined) params.set('minRating', String(band.minRating));
  if (band.maxRating !== undefined) params.set('maxRating', String(band.maxRating));
  return `/api/games/imported?${params.toString()}`;
}

/** Find games' list: 20 imported games per page, next page fetched on
 * demand (see useInfiniteScroll). Under the ['games'] key prefix so a delete
 * refetches the loaded pages. */
export function useImportedGamesList(filters: ImportedGamesFilters) {
  return useInfiniteQuery({
    queryKey: ['games', 'imported', filters.range, filters.ratingBandKey],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => apiGet(pageUrl(filters, pageParam), ImportedGamesPageSchema, signal),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.reduce((count, page) => count + page.items.length, 0) : undefined
  });
}
