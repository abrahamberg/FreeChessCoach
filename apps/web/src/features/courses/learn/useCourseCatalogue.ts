import { CourseCatalogResponseSchema, type CourseCatalogResponse, type CourseKind } from '@freechesscoach/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../../../api/client.js';

export type CatalogueSort = 'curriculum' | 'newest';

/** docs/courses.md §9: public courses, of one kind or all, in curriculum
 * order (level, then place) or newest first, a page at a time. */
export function useCourseCatalogue(kind: CourseKind | null, sort: CatalogueSort = 'curriculum') {
  return useInfiniteQuery({
    queryKey: ['course-catalogue', kind, sort],
    initialPageParam: null as string | null,
    getNextPageParam: (page: CourseCatalogResponse) => page.nextCursor,
    queryFn: ({ signal, pageParam }) => {
      const query = new URLSearchParams({ sort, ...(kind ? { kind } : {}), ...(pageParam ? { cursor: pageParam } : {}) });
      return apiGet(`/api/public/courses?${query.toString()}`, CourseCatalogResponseSchema, signal);
    }
  });
}
