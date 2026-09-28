import { CourseCatalogResponseSchema, type CourseKind } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../api/client.js';

export type CatalogueSort = 'curriculum' | 'newest';

/** docs/courses.md §9: the first page of public courses, of one kind or all,
 * in curriculum order (level, then place) or newest first. */
export function useCourseCatalogue(kind: CourseKind | null, sort: CatalogueSort = 'curriculum') {
  return useQuery({
    queryKey: ['course-catalogue', kind, sort],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ sort, ...(kind ? { kind } : {}) });
      return apiGet(`/api/public/courses?${query.toString()}`, CourseCatalogResponseSchema, signal);
    }
  });
}
