import { CourseCatalogResponseSchema, type CourseKind } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../api/client.js';

/** docs/courses.md §9: the first page of public courses, of one kind or all. */
export function useCourseCatalogue(kind: CourseKind | null) {
  return useQuery({
    queryKey: ['course-catalogue', kind],
    queryFn: ({ signal }) => apiGet(`/api/public/courses${kind ? `?kind=${kind}` : ''}`, CourseCatalogResponseSchema, signal)
  });
}
