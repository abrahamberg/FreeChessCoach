import { COURSE_STAGES, type CourseStage } from '@freechesscoach/chess-analysis';
import { PublicCourseResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiGet } from '../../../api/client.js';
import { CoursePlayer } from './CoursePlayer.js';
import { useCourseProgressStore } from './useCourseProgressStore.js';

/** `/learn/:slug` (docs/courses.md §9): a published course, no login. Lives
 * outside the app shell, which needs a signed-in user. */
export function LearnPage(): ReactNode {
  const { slug = '' } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  const progress = useCourseProgressStore();
  const course = useQuery({
    queryKey: ['public-course', slug],
    queryFn: ({ signal }) => apiGet(`/api/public/courses/${encodeURIComponent(slug)}`, PublicCourseResponseSchema, signal)
  });
  const noteAudio = course.data?.noteAudio;
  const source = useCallback(
    (episodeId: string, nodeId: string) => Promise.resolve(noteAudio?.[`${episodeId}:${nodeId}`] ?? null),
    [noteAudio]
  );

  useEffect(() => {
    if (course.data) window.document.title = `${course.data.document.title} · FreeChessCoach`;
  }, [course.data]);

  if (course.isPending) return <p className="course-player meta">Loading the course…</p>;
  if (course.isError) {
    const missing = course.error instanceof ApiError && course.error.status === 404;
    return (
      <div className="course-player">
        <h1>{missing ? 'No course here' : 'Could not load the course'}</h1>
        <p className="meta">{missing ? 'The link may be wrong, or the course was taken down.' : 'Try again in a moment.'}</p>
        <a href="/">FreeChessCoach</a>
      </div>
    );
  }
  return (
    <div className="learn-page">
      <CoursePlayer document={course.data.document} noteAudio={source} progress={progress} courseSlug={course.data.slug} startStage={stageFromSearch(search)} />
      <footer className="learn-page__footer">
        <a href="/">FreeChessCoach</a>: a free chess coach for your own games.
      </footer>
    </div>
  );
}

/** `?stage=practice` and so on; `?drill=1` is the older link for the drill. */
function stageFromSearch(search: URLSearchParams): CourseStage {
  const stage = search.get('stage');
  if ((COURSE_STAGES as readonly string[]).includes(stage ?? '')) return stage as CourseStage;
  return search.get('drill') === '1' ? 'drill' : 'play_through';
}
