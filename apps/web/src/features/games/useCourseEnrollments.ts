import { CourseEnrollmentListResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';
import { importBrowserProgress } from '../courses/player/course-progress.js';

/** docs/courses.md §11: the courses the learner has started. Courses begun
 * before signing in are moved to the account first, so they show here too. */
export function useCourseEnrollments() {
  return useQuery({
    queryKey: ['course-enrollments'],
    queryFn: async ({ signal }) => {
      await importBrowserProgress().catch(() => undefined);
      return apiGet('/api/course-enrollments', CourseEnrollmentListResponseSchema, signal);
    }
  });
}
