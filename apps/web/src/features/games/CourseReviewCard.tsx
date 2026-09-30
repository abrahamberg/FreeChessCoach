import type { CourseReviewDueResponse } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarIcon, PlaySmallIcon } from '../../components/Icon.js';
import './GameCard.css';
import './RailCard.css';

export interface CourseReviewCardProps {
  course: CourseReviewDueResponse['courses'][number];
}

/** docs/courses.md §11: one course with moves due for review today, on the
 * Games page's "Due today" rail; opens the course straight into its drill. */
export function CourseReviewCard({ course }: CourseReviewCardProps): ReactNode {
  const moves = course.due === 1 ? '1 move' : `${course.due} moves`;
  return (
    <div className="card rail-card">
      <div className="rail-card__top">
        <span className="rail-card__chip">
          <CalendarIcon width={16} height={16} />
          Review
        </span>
      </div>
      <span className="rail-card__title rail-card__title-wrap">{course.title}</span>
      <span className="rail-card__meta">
        {moves} to play again{course.sans.length ? `: ${course.sans.join(', ')}${course.due > course.sans.length ? ', …' : ''}` : ''}
      </span>
      <div className="rail-card__actions">
        <span className="badge badge--primary game-card__status">Due today</span>
        <span className="game-card__spacer" />
        <Link
          to={`/courses/${encodeURIComponent(course.slug)}?stage=drill`}
          className="game-card__icon-action game-card__icon-action--primary"
          title="Drill"
          aria-label={`Drill ${course.title}`}
        >
          <PlaySmallIcon width={16} height={16} />
        </Link>
      </div>
    </div>
  );
}
