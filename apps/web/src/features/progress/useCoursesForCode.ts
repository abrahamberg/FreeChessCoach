import { CourseCatalogResponseSchema, type CourseCatalogItem, type DiagnosisCodeId } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';

/** The most courses a focus-area card lists. */
export const COURSES_PER_FOCUS_AREA = 3;

/** Public courses that train one diagnosis code, in curriculum order; none
 * when the area has no code (a legacy row). */
export function useCoursesForCode(code: DiagnosisCodeId | null) {
  return useQuery<CourseCatalogItem[]>({
    queryKey: ['courses-for-code', code],
    enabled: code !== null,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({ code: code ?? '', sort: 'curriculum', limit: String(COURSES_PER_FOCUS_AREA) });
      return (await apiGet(`/api/public/courses?${query.toString()}`, CourseCatalogResponseSchema, signal)).items;
    }
  });
}
