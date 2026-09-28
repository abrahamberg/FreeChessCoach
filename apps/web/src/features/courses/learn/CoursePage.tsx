import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PublishedCourse, stageFromSearch } from '../player/PublishedCourse.js';

/** `/courses/:slug`: the same player as the public `/learn/:slug`, inside the
 * app shell for a signed-in learner (docs/courses.md §11). */
export function CoursePage(): ReactNode {
  const { slug = '' } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  return <PublishedCourse key={slug} slug={slug} startStage={stageFromSearch(search)} home={<Link to="/courses">All courses</Link>} />;
}
