import { levelCode, type CourseSummary } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { describeApiError } from '../../../api/client.js';
import { ConfirmDialog } from '../../../components/ConfirmDialog.js';
import { BookIcon, EditIcon, ExternalLinkIcon, TrashIcon } from '../../../components/Icon.js';
import { shortDate } from '../../games/gameDisplay.js';
import { COURSE_KIND_INFO } from '../courseKinds.js';
import { useDeleteCourse } from './courseAdminApi.js';
import { COURSE_STATUS, isPublished } from './course-status.js';

/** One course on the admin list: kind, status, title, size, Manage, Open once published, Delete. */
export function CourseAdminCard({ course }: { course: CourseSummary }): ReactNode {
  const status = COURSE_STATUS[course.status];
  const published = isPublished(course.status);
  const title = course.title || 'Untitled course';
  const remove = useDeleteCourse();
  const [confirming, setConfirming] = useState(false);
  return (
    <article className="card courses-home__course course-admin__card">
      <span className="rail-card__top">
        <span className="rail-card__chip">
          <BookIcon width={16} height={16} />
          {COURSE_KIND_INFO[course.kind].label}
        </span>
        {course.level && <span className="courses-home__code">{levelCode(course.level)}</span>}
        <span className={`${status.badge} courses-home__status`}>{status.label}</span>
      </span>
      <h2 className="rail-card__title rail-card__title-wrap course-admin__title">
        <Link to={`/manage/courses/${course.id}`}>{title}</Link>
      </h2>
      {course.promise && <span className="courses-home__promise">{course.promise}</span>}
      <span className="rail-card__meta">
        {course.moves} moves · {course.episodes === 1 ? '1 episode' : `${course.episodes} episodes`} · changed {shortDate(course.updatedAt)}
      </span>
      <div className="rail-card__actions">
        <Link to={`/manage/courses/${course.id}`} className="btn-primary course-admin__action" aria-label={`Manage ${title}`}>
          <EditIcon width={16} height={16} />
          Manage
        </Link>
        {published && (
          <Link to={`/learn/${course.slug}`} className="btn-secondary course-admin__action" aria-label={`Open ${title}`} target="_blank" rel="noreferrer">
            <ExternalLinkIcon width={16} height={16} />
            Open
          </Link>
        )}
        <button type="button" className="delete-game-button delete-game-button--icon" title="Delete course" aria-label={`Delete ${title}`} disabled={remove.isPending} onClick={() => setConfirming(true)}>
          <TrashIcon width={16} height={16} />
        </button>
      </div>
      {remove.isError && (
        <span className="rail-card__meta course-admin__warning" role="alert">
          {describeApiError(remove.error) ?? 'Could not delete the course.'}
        </span>
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete this course?"
          description={
            <p>
              Deleting <strong>{title}</strong> also deletes its notes and voice files.
              {published && ' It is published: learners lose it and its link stops working.'} This cannot be undone.
            </p>
          }
          confirmLabel="Delete course"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            remove.mutate(course.id);
          }}
        />
      )}
    </article>
  );
}
