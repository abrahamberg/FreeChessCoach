import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/client.js';
import { SortControl, byCurriculum } from '../learn/course-sort.js';
import type { CatalogueSort } from '../learn/useCourseCatalogue.js';
import { CourseAdminCard } from './CourseAdminCard.js';
import { CourseTokensPanel } from './CourseTokensPanel.js';
import { useCourses } from './courseAdminApi.js';
import { isPublished } from './course-status.js';
import '../../games/GameCard.css';
import '../../games/DeleteGameButton.css';
import '../../games/GamesPage.css';
import '../../games/RailCard.css';
import '../learn/LearnHomePage.css';
import './CoursesAdminPage.css';

type Filter = 'all' | 'drafts' | 'published';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['drafts', 'Drafts'],
  ['published', 'Published']
];

/** `/manage/courses` (docs/courses.md §2, §9): every course, for every
 * course editor. Courses are made in the studio and arrive through the
 * course API; here they are checked, published and looked after. */
export function CoursesAdminPage(): ReactNode {
  const courses = useCourses();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<CatalogueSort>('newest');
  const list = courses.data?.courses ?? [];
  const filtered = list.filter((course) => filter === 'all' || (filter === 'drafts' ? course.status === 'draft' : isPublished(course.status)));
  // The API lists the newest edit first; curriculum is level, then place.
  const shown = sort === 'curriculum' ? byCurriculum(filtered) : filtered;

  return (
    <div className="page courses-home">
      <header className="course-admin__header">
        <div>
          <h1>Manage courses</h1>
          <p className="courses-home__empty">Courses arrive from the studio through the course API. Check, publish and look after them here.</p>
        </div>
      </header>

      {courses.isPending && <p className="courses-home__empty">Loading…</p>}
      {courses.isError && (
        <p className="courses-home__empty" role="alert">
          {describeApiError(courses.error) ?? 'Could not load the courses.'}
        </p>
      )}
      {courses.isSuccess && !list.length && <p className="courses-home__empty">No courses yet. Make a token below and let the studio import one.</p>}

      {list.length > 0 && (
        <section aria-label="Courses" className="games-page__section">
          <div className="courses-home__browse-header">
            <div className="courses-home__filters" role="group" aria-label="Show">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" className="courses-home__filter" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
            <SortControl value={sort} onChange={setSort} />
          </div>
          {shown.length ? (
            <div className="courses-home__grid">
              {shown.map((course) => (
                <CourseAdminCard key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <p className="courses-home__empty">{filter === 'drafts' ? 'No drafts.' : 'Nothing published yet.'}</p>
          )}
        </section>
      )}

      <CourseTokensPanel />
    </div>
  );
}
