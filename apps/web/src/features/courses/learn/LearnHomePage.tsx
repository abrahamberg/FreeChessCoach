import { bandForRating, COURSE_KINDS, levelCode, type CourseCatalogItem, type CourseEnrollment, type CourseKind, type CourseReviewDueResponse } from '@freechesscoach/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, describeApiError } from '../../../api/client.js';
import { HorizontalScroller } from '../../../components/HorizontalScroller.js';
import { BookIcon, CheckIcon, PlaySmallIcon } from '../../../components/Icon.js';
import { CourseContinueCard } from '../../games/CourseContinueCard.js';
import { shortDate } from '../../games/gameDisplay.js';
import { useCourseEnrollments } from '../../games/useCourseEnrollments.js';
import { useCourseReviewsDue } from '../../games/useCourseReviewsDue.js';
import { BAND_LABELS } from '../../settings/BandSelect.js';
import { COURSE_KIND_INFO } from '../courseKinds.js';
import { useCourseCatalogue, type CatalogueSort } from './useCourseCatalogue.js';
import { SortControl, levelGroups } from './course-sort.js';
import '../../games/GameCard.css';
import '../../games/GamesPage.css';
import '../../games/RailCard.css';
import './CoursesHomePage.css';

type DueCourse = CourseReviewDueResponse['courses'][number];

/** docs/courses.md §9, §11: `/courses`, the learner's courses in the Games
 * page's style. Learning (started, unfinished; can be removed), Browse (the
 * public catalogue by kind, marking courses already learning or learned) and
 * Learned (finished, with moves due for review). */
export function CoursesHomePage(): ReactNode {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CourseKind | null>(null);
  const [sort, setSort] = useState<CatalogueSort>('curriculum');
  const enrollments = useCourseEnrollments();
  const catalogue = useCourseCatalogue(kind, sort);
  const browse = catalogue.data?.pages.flatMap((page) => page.items) ?? [];
  const due = useCourseReviewsDue().data?.courses ?? [];
  const remove = useMutation({
    mutationFn: (slug: string) => apiDelete(`/api/course-enrollments/${encodeURIComponent(slug)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['course-enrollments'] })
  });

  const items = enrollments.data?.items ?? [];
  const learning = items.filter((item) => item.completedAt === null);
  const learned = items.filter((item) => item.completedAt !== null);
  const status = new Map(items.map((item) => [item.slug, item.completedAt ? 'Learned' : 'Learning']));
  const dueBySlug = new Map(due.map((course) => [course.slug, course]));

  return (
    <div className="page courses-home">
      <h1>Courses</h1>

      <section aria-label="Learning" className="games-page__section">
        <h2 className="games-page__section-heading">Learning</h2>
        {enrollments.isError && <p className="games-page__empty">{describeApiError(enrollments.error) ?? 'Could not load your courses.'}</p>}
        {remove.isError && <p className="games-page__empty">{describeApiError(remove.error) ?? 'Could not remove the course.'}</p>}
        {enrollments.isSuccess && !learning.length && <p className="courses-home__empty">No courses started yet. Pick one below; your place is kept as you go.</p>}
        {learning.length > 0 && (
          <HorizontalScroller label="Courses you are learning">
            {learning.map((course) => (
              <CourseContinueCard key={course.slug} course={course} onRemove={(slug) => remove.mutate(slug)} />
            ))}
          </HorizontalScroller>
        )}
      </section>

      <section aria-label="Browse" className="games-page__section">
        <div className="courses-home__browse-header">
          <h2 className="games-page__section-heading">Browse</h2>
          <SortControl value={sort} onChange={setSort} />
        </div>
        <div className="courses-home__filters" role="group" aria-label="Kind of course">
          <button type="button" className="courses-home__filter" aria-pressed={kind === null} onClick={() => setKind(null)}>
            All
          </button>
          {COURSE_KINDS.map((each) => (
            <button key={each} type="button" className="courses-home__filter" aria-pressed={kind === each} onClick={() => setKind(each)}>
              {COURSE_KIND_INFO[each].label}
            </button>
          ))}
        </div>
        {catalogue.isPending && <p className="courses-home__empty">Loading…</p>}
        {catalogue.isError && <p className="courses-home__empty">{describeApiError(catalogue.error) ?? 'Could not load the courses.'}</p>}
        {catalogue.isSuccess && !browse.length && (
          <p className="courses-home__empty">{kind ? `No public ${COURSE_KIND_INFO[kind].label.toLowerCase()} courses yet.` : 'No public courses yet.'}</p>
        )}
        {browse.length > 0 &&
          (sort === 'curriculum' ? (
            levelGroups(browse).map((group) => (
              <div key={group.rating ?? 'none'} className="courses-home__level">
                <h3 className="courses-home__level-heading">
                  {group.rating === null ? 'Other courses' : `${group.rating}`}
                  {group.rating !== null && <span className="meta"> · {BAND_LABELS[bandForRating(group.rating)]}</span>}
                </h3>
                <div className="courses-home__grid">
                  {group.items.map((course) => (
                    <CatalogueCard key={course.slug} course={course} status={status.get(course.slug)} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="courses-home__grid">
              {browse.map((course) => (
                <CatalogueCard key={course.slug} course={course} status={status.get(course.slug)} />
              ))}
            </div>
          ))}
        {catalogue.hasNextPage && (
          <button type="button" className="btn-secondary courses-home__more" disabled={catalogue.isFetchingNextPage} onClick={() => void catalogue.fetchNextPage()}>
            {catalogue.isFetchingNextPage ? 'Loading…' : 'More courses'}
          </button>
        )}
      </section>

      <section aria-label="Learned" className="games-page__section">
        <h2 className="games-page__section-heading">Learned</h2>
        {!learned.length && <p className="courses-home__empty">Courses you finish land here, with their moves to review.</p>}
        {learned.length > 0 && (
          <HorizontalScroller label="Courses you have learned">
            {learned.map((course) => (
              <LearnedCard key={course.slug} course={course} due={dueBySlug.get(course.slug)} />
            ))}
          </HorizontalScroller>
        )}
      </section>
    </div>
  );
}

function CatalogueCard({ course, status }: { course: CourseCatalogItem; status?: string }): ReactNode {
  return (
    <Link to={`/courses/${encodeURIComponent(course.slug)}`} className="card courses-home__course">
      <span className="rail-card__top">
        <span className="rail-card__chip">
          <BookIcon width={16} height={16} />
          {COURSE_KIND_INFO[course.kind].label}
        </span>
        {course.level && <span className="courses-home__code">{levelCode(course.level)}</span>}
        {status && <span className="badge badge--primary courses-home__status">{status}</span>}
      </span>
      <span className="rail-card__title rail-card__title-wrap">{course.title}</span>
      {course.promise && <span className="courses-home__promise">{course.promise}</span>}
      <span className="rail-card__meta">
        {BAND_LABELS[course.levelBand]} · plays {course.learnerSide} · {course.episodes === 1 ? '1 part' : `${course.episodes} parts`}
      </span>
    </Link>
  );
}

function LearnedCard({ course, due }: { course: CourseEnrollment; due?: DueCourse }): ReactNode {
  const moves = due ? (due.due === 1 ? '1 move to review' : `${due.due} moves to review`) : null;
  return (
    <div className="card rail-card">
      <div className="rail-card__top">
        <span className="rail-card__chip">
          <CheckIcon width={16} height={16} />
          Learned
        </span>
      </div>
      <Link to={`/courses/${encodeURIComponent(course.slug)}`} className="rail-card__title rail-card__title-wrap courses-home__title-link">
        {course.title}
      </Link>
      <span className="rail-card__meta">
        {course.completedAt && <time dateTime={course.completedAt}>Finished {shortDate(course.completedAt)}</time>}
      </span>
      <div className="rail-card__actions">
        <span className={due ? 'badge badge--primary game-card__status' : 'badge game-card__status'}>{moves ?? 'Nothing due'}</span>
        <span className="game-card__spacer" />
        {due && (
          <Link
            to={`/courses/${encodeURIComponent(course.slug)}?stage=drill`}
            className="game-card__icon-action game-card__icon-action--primary"
            title="Drill"
            aria-label={`Drill ${course.title}`}
          >
            <PlaySmallIcon width={16} height={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
