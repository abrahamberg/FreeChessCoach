import { COURSE_STAGES, type CourseStage } from '@freechesscoach/chess-analysis';
import { PublicCourseResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiGet } from '../../../api/client.js';
import { courseReadPath } from '../learn/course-read-path.js';
import { CoursePlayer } from './CoursePlayer.js';
import { useCourseProgressStore } from './useCourseProgressStore.js';

export interface PublishedCourseProps {
  slug: string;
  startStage?: CourseStage;
}

/** docs/courses.md §9: a published course in the player, fetched by its
 * slug, at `/learn/:slug` for everyone. Signed in, the learner gets the rest
 * (their saved progress, review, Ask my coach, the account menu, a way back
 * to their Courses); signed out, the same course works from this browser. */
export function PublishedCourse({ slug, startStage }: PublishedCourseProps): ReactNode {
  const navigate = useNavigate();
  const progress = useCourseProgressStore();
  const signedIn = progress?.signedIn ?? false;
  const home = <Link to="/learn">All courses</Link>;
  const back = { label: 'Back to Courses', onBack: () => navigate('/learn') };
  // Waits to know who is asking: a members-only course is only on the signed-in route.
  const course = useQuery({
    queryKey: ['public-course', signedIn, slug],
    enabled: progress !== null,
    queryFn: ({ signal }) => apiGet(`${courseReadPath(signedIn)}/${encodeURIComponent(slug)}`, PublicCourseResponseSchema, signal)
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
        <p className="meta">{missing ? missingReason(signedIn) : 'Try again in a moment.'}</p>
        {home}
      </div>
    );
  }
  return (
    <CoursePlayer
      document={course.data.document}
      noteAudio={source}
      progress={progress}
      courseSlug={course.data.slug}
      startStage={startStage}
      evals={course.data.evals}
      back={back}
      inApp={signedIn}
      seriesNeighbours={course.data.seriesNeighbours}
    />
  );
}

/** `?stage=practice` and so on; `?drill=1` is the older link for the drill.
 * None: the learner's saved stage, else the play-through. */
export function stageFromSearch(search: URLSearchParams): CourseStage | undefined {
  const stage = search.get('stage');
  if ((COURSE_STAGES as readonly string[]).includes(stage ?? '')) return stage as CourseStage;
  return search.get('drill') === '1' ? 'drill' : undefined;
}

/** A members-only course is 404 to whoever may not open it, like a wrong link. */
function missingReason(signedIn: boolean): string {
  if (signedIn) return 'The link may be wrong, the course was taken down, or it is for members only.';
  return 'The link may be wrong or the course was taken down. If it is for members only, sign in to open it.';
}
