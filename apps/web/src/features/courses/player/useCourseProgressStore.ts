import { useQuery } from '@tanstack/react-query';
import { accountProgressStore, browserProgressStore, importBrowserProgress, isSignedIn, type CourseProgressStore } from './course-progress.js';

/** The account's store when signed in (moving this browser's progress over
 * first), else the browser's; null while that is being found out. */
export function useCourseProgressStore(): CourseProgressStore | null {
  const signedIn = useQuery({
    queryKey: ['course-progress-signed-in'],
    queryFn: async () => {
      const yes = await isSignedIn();
      if (yes) await importBrowserProgress().catch(() => undefined);
      return yes;
    },
    staleTime: Infinity,
    retry: false
  });
  if (signedIn.isPending) return null;
  return signedIn.data ? accountProgressStore : browserProgressStore;
}
