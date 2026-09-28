import { CourseReviewDueResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client.js';
import { importBrowserProgress, localToday } from '../courses/player/course-progress.js';

/** docs/courses.md §11: courses with moves due today, in the learner's own
 * day. Drills done before signing in are moved to the account first, so
 * they count here too. */
export function useCourseReviewsDue() {
  return useQuery({
    queryKey: ['course-reviews-due'],
    queryFn: async ({ signal }) => {
      await importBrowserProgress().catch(() => undefined);
      return apiGet(`/api/course-progress/due?today=${localToday()}`, CourseReviewDueResponseSchema, signal);
    }
  });
}
