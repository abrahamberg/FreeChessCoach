import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PublishedCourse, stageFromSearch } from './PublishedCourse.js';

/** `/learn/:slug` (docs/courses.md §9): a published course, for everyone.
 * Outside the app shell, which needs a signed-in user; the player itself
 * checks for one and adds what an account has. */
export function LearnPage(): ReactNode {
  const { slug = '' } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  return (
    <div className="learn-page">
      <PublishedCourse key={slug} slug={slug} startStage={stageFromSearch(search)} />
    </div>
  );
}
