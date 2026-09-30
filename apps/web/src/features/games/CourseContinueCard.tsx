import { COURSE_STAGES } from '@freechesscoach/chess-analysis';
import type { CourseEnrollment } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookIcon, PlaySmallIcon, TrashIcon } from '../../components/Icon.js';
import { useConfirmDialog } from '../../hooks/useConfirmDialog.js';
import { STAGE_LABELS } from '../courses/player/CourseStageBar.js';
import { shortDate } from './gameDisplay.js';
import './DeleteGameButton.css';
import './GameCard.css';
import './RailCard.css';

export interface CourseContinueCardProps {
  course: CourseEnrollment;
  /** The Courses page's Learning rail: take it off the learner's list. */
  onRemove?: (slug: string) => void;
}

/** docs/courses.md §11: an unfinished course on the Continue rail — its
 * stage, how many of the four stages are done, and a play button that opens
 * it where the learner left it (the player resumes the saved stage and place). */
export function CourseContinueCard({ course, onRemove }: CourseContinueCardProps): ReactNode {
  const { confirm, dialog } = useConfirmDialog();
  const done = COURSE_STAGES.filter((stage) => course.stagesDone.includes(stage)).length;
  const stageNumber = COURSE_STAGES.indexOf(course.stage) + 1;
  return (
    <div className="card rail-card">
      <div className="rail-card__top">
        <span className="rail-card__chip">
          <BookIcon width={16} height={16} />
          Course
        </span>
      </div>
      <span className="rail-card__title rail-card__title-wrap">{course.title}</span>
      <span className="rail-card__meta">
        <span>{`Stage ${stageNumber} of ${COURSE_STAGES.length}: ${STAGE_LABELS[course.stage]}`}</span>
        <time dateTime={course.updatedAt}>· {shortDate(course.updatedAt)}</time>
      </span>
      <progress className="rail-card__progress" value={done} max={COURSE_STAGES.length} aria-label={`${done} of ${COURSE_STAGES.length} stages done`} />
      <div className="rail-card__actions">
        <span className="badge badge--primary game-card__status">In progress</span>
        <span className="game-card__spacer" />
        <Link
          to={`/courses/${encodeURIComponent(course.slug)}`}
          className="game-card__icon-action game-card__icon-action--primary"
          title="Continue"
          aria-label={`Continue course: ${course.title}`}
        >
          <PlaySmallIcon width={16} height={16} />
        </Link>
        {onRemove && (
          <button
            type="button"
            className="delete-game-button delete-game-button--icon"
            title="Remove from my learning"
            aria-label={`Remove ${course.title} from my learning`}
            onClick={() =>
              confirm(
                {
                  title: 'Remove this course from your learning?',
                  description: 'It leaves Learning and Continue, and its stage is forgotten. Moves you drilled stay in your reviews.',
                  confirmLabel: 'Remove'
                },
                () => onRemove(course.slug)
              )
            }
          >
            <TrashIcon width={16} height={16} />
          </button>
        )}
      </div>
      {dialog}
    </div>
  );
}
