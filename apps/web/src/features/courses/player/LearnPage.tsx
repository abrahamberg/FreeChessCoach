import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PublishedCourse, stageFromSearch } from './PublishedCourse.js';

/** `/learn/:slug` (docs/courses.md §9): a published course, no login. Lives
 * outside the app shell, which needs a signed-in user. */
export function LearnPage(): ReactNode {
  const { slug = '' } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  return (
    <div className="learn-page">
      <PublishedCourse key={slug} slug={slug} startStage={stageFromSearch(search)} home={<a href="/">FreeChessCoach</a>} />
      <footer className="learn-page__footer">
        <a href="/">FreeChessCoach</a>: a free chess coach for your own games.
      </footer>
    </div>
  );
}
