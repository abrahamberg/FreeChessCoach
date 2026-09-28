import { levelCode, type CourseStatus, type CourseSummary } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import { BookIcon, EditIcon, ExternalLinkIcon, PlusIcon } from '../../components/Icon.js';
import { shortDate } from '../games/gameDisplay.js';
import { useCourses } from './courseApi.js';
import { SortControl, byCurriculum } from './learn/course-sort.js';
import type { CatalogueSort } from './learn/useCourseCatalogue.js';
import { COURSE_KIND_INFO } from './courseKinds.js';
import '../games/GameCard.css';
import '../games/GamesPage.css';
import '../games/RailCard.css';
import './learn/CoursesHomePage.css';
import './CoursesPage.css';

type Filter = 'all' | 'drafts' | 'published';

const STATUS: Record<CourseStatus, { label: string; badge: string }> = {
  draft: { label: 'Draft', badge: 'badge' },
  unlisted: { label: 'Unlisted', badge: 'badge badge--info' },
  public: { label: 'Public', badge: 'badge badge--primary' },
  removed: { label: 'Removed', badge: 'badge badge--danger' }
};

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['drafts', 'Drafts'],
  ['published', 'Published']
];

/** `/studio` (docs/courses.md §9): the creator's courses as cards, in the
 * Courses page's style: kind, status, title, promise and size, the AI's
 * writing while it runs, Edit, and Open once published. */
export function CoursesPage(): ReactNode {
  const courses = useCourses();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<CatalogueSort>('newest');
  const list = courses.data?.courses ?? [];
  const filtered = list.filter((course) => filter === 'all' || (filter === 'drafts' ? course.status === 'draft' : course.status === 'unlisted' || course.status === 'public'));
  // The API lists the newest edit first; curriculum is level, then place.
  const shown = sort === 'curriculum' ? byCurriculum(filtered) : filtered;

  return (
    <div className="page courses-home studio">
      <header className="studio__header">
        <div>
          <h1>Course studio</h1>
          <p className="courses-home__empty">Turn a PGN into a course, a YouTube video and a reel.</p>
        </div>
        <Link to="/studio/new" className="btn-primary studio__new">
          <PlusIcon width={16} height={16} />
          New course
        </Link>
      </header>

      {courses.isPending && <p className="courses-home__empty">Loading…</p>}
      {courses.isError && (
        <p className="courses-home__empty" role="alert">
          {describeApiError(courses.error) ?? 'Could not load your courses.'}
        </p>
      )}

      {courses.isSuccess && !list.length && <EmptyStudio />}

      {list.length > 0 && (
        <section aria-label="Your courses" className="games-page__section">
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
                <StudioCard key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <p className="courses-home__empty">{filter === 'drafts' ? 'No drafts.' : 'Nothing published yet.'}</p>
          )}
        </section>
      )}
    </div>
  );
}

function StudioCard({ course }: { course: CourseSummary }): ReactNode {
  const status = STATUS[course.status];
  const writing = course.generation && (course.generation.status === 'queued' || course.generation.status === 'running') ? course.generation : null;
  const published = course.status === 'unlisted' || course.status === 'public';
  const title = course.title || 'Untitled course';
  return (
    <article className="card courses-home__course studio__card">
      <span className="rail-card__top">
        <span className="rail-card__chip">
          <BookIcon width={16} height={16} />
          {COURSE_KIND_INFO[course.kind].label}
        </span>
        {course.level && <span className="courses-home__code">{levelCode(course.level)}</span>}
        <span className={`${status.badge} courses-home__status`}>{status.label}</span>
      </span>
      <h2 className="rail-card__title rail-card__title-wrap studio__title">
        <Link to={`/studio/${course.id}/edit`}>{title}</Link>
      </h2>
      {course.promise && <span className="courses-home__promise">{course.promise}</span>}
      <span className="rail-card__meta">
        {course.moves} moves · {course.episodes === 1 ? '1 episode' : `${course.episodes} episodes`} · edited {shortDate(course.updatedAt)}
      </span>
      {writing && (
        <span className="studio__writing">
          <progress
            className="rail-card__progress"
            value={writing.done}
            max={Math.max(writing.total, 1)}
            aria-label={`The AI is writing: ${writing.done} of ${writing.total}`}
          />
          <span className="rail-card__meta">The AI is writing…</span>
        </span>
      )}
      {course.generation?.status === 'failed' && <span className="rail-card__meta studio__failed">The AI's writing stopped; open it to resume.</span>}
      <div className="rail-card__actions">
        <Link to={`/studio/${course.id}/edit`} className="btn-primary studio__action" aria-label={`Edit ${title}`}>
          <EditIcon width={16} height={16} />
          Edit
        </Link>
        {published && (
          <Link to={`/learn/${course.slug}`} className="btn-secondary studio__action" aria-label={`Open ${title}`} target="_blank" rel="noreferrer">
            <ExternalLinkIcon width={16} height={16} />
            Open
          </Link>
        )}
      </div>
    </article>
  );
}

/** How a course is made, for a creator with none yet. */
function EmptyStudio(): ReactNode {
  const steps = [
    ['Paste a PGN', 'A game, an opening line or a trap, and one line on what to teach.'],
    ['The AI writes it', 'Episodes, notes, quizzes and the videos, checked against the engine.'],
    ['Preview', 'As a learner, and the video with the coach’s voice.'],
    ['Publish', 'Unlisted for a link, or public in Browse.']
  ];
  return (
    <section className="card studio__empty" aria-label="How a course is made">
      <ol className="studio__steps">
        {steps.map(([title, text], index) => (
          <li key={title}>
            <span className="studio__step-number" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <strong>{title}</strong>
              <span className="courses-home__promise">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link to="/studio/new" className="btn-primary studio__new">
        <PlusIcon width={16} height={16} />
        New course
      </Link>
    </section>
  );
}
