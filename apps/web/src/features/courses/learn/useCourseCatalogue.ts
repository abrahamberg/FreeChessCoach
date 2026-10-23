import { CourseCatalogResponseSchema, type CourseCatalogResponse, type CourseKind } from '@freechesscoach/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../../../api/client.js';
import { useCourseProgressStore } from '../player/useCourseProgressStore.js';
import { courseReadPath } from './course-read-path.js';

export type CatalogueSort = 'curriculum' | 'newest';

/** docs/courses.md §9: public courses, of one kind or all, in curriculum
 * order (level, then place) or newest first, a page at a time. Signed in,
 * also the members-only ones the learner may open; waits until that is known. */
export function useCourseCatalogue(kind: CourseKind | null, sort: CatalogueSort = 'curriculum') {
  const store = useCourseProgressStore();
  const signedIn = store?.signedIn ?? false;
  return useInfiniteQuery({
    queryKey: ['course-catalogue', signedIn, kind, sort],
    enabled: store !== null,
    initialPageParam: null as string | null,
    getNextPageParam: (page: CourseCatalogResponse) => page.nextCursor,
    queryFn: ({ signal, pageParam }) => {
      const query = new URLSearchParams({ sort, ...(kind ? { kind } : {}), ...(pageParam ? { cursor: pageParam } : {}) });
      return apiGet(`${courseReadPath(signedIn)}?${query.toString()}`, CourseCatalogResponseSchema, signal);
    }
  });
}
