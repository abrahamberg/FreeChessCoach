import type { CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { describeApiError } from '../../../api/client.js';
import { ArrowLeftIcon, EyeIcon, ExternalLinkIcon } from '../../../components/Icon.js';
import { shortDate } from '../../games/gameDisplay.js';
import { COURSE_KIND_INFO } from '../courseKinds.js';
import { LearnerPreview } from '../player/LearnerPreview.js';
import { ClipLinksForm } from './ClipLinksForm.js';
import { useCourse, usePublishCheck } from './courseAdminApi.js';
import { COURSE_STATUS, isPublished } from './course-status.js';
import { CourseProblems } from './CourseProblems.js';
import { PublishDialog } from './PublishDialog.js';
import { VisibilityForm } from './VisibilityForm.js';
import '../../games/RailCard.css';
import '../learn/LearnHomePage.css';
import './CourseAdmin.css';
import './CoursesAdminPage.css';

/** `/manage/courses/:id` (docs/courses.md §9): one course as the studio
 * sent it: the checks, the notes still without audio, the learner preview,
 * publishing, visibility and the posted videos. Nothing here edits the
 * course's text: the studio does, and imports it again. */
export function CourseAdminPage(): ReactNode {
  const { id = '' } = useParams();
  const course = useCourse(id);
  if (course.isPending) return <p className="page courses-home__empty">Loading…</p>;
  if (course.isError) {
    return (
      <p className="page courses-home__empty" role="alert">
        {describeApiError(course.error) ?? 'Could not load the course.'}
      </p>
    );
  }
  return <CourseAdmin course={course.data} />;
}

function CourseAdmin({ course }: { course: CourseResponse }): ReactNode {
  const check = usePublishCheck(course.id);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const status = COURSE_STATUS[course.status];
  const problems = check.data?.problems ?? [];

  return (
    <div className="page courses-home">
      <Link to="/manage/courses" className="course-admin__action">
        <ArrowLeftIcon width={16} height={16} />
        All courses
      </Link>
      <header className="course-admin__header">
        <div>
          <span className="rail-card__top">
            <span className="rail-card__chip">{COURSE_KIND_INFO[course.kind].label}</span>
            <span className={`${status.badge} courses-home__status`}>{status.label}</span>
          </span>
          <h1>{course.title || 'Untitled course'}</h1>
          <p className="meta">
            /learn/{course.slug} · {course.document.nodes.length} moves · {course.document.episodes.length} episodes · changed {shortDate(course.updatedAt)}
            {course.publishedAt && ` · published ${shortDate(course.publishedAt)}`}
          </p>
        </div>
        <div className="course-admin__row">
          <button type="button" className="btn-secondary course-admin__action" onClick={() => setPreviewing(true)}>
            <EyeIcon width={16} height={16} />
            Preview as learner
          </button>
          {isPublished(course.status) && (
            <Link to={`/learn/${course.slug}`} className="btn-secondary course-admin__action" target="_blank" rel="noreferrer">
              <ExternalLinkIcon width={16} height={16} />
              Open
            </Link>
          )}
          {course.status !== 'removed' && (
            <button type="button" className="btn-primary course-admin__action" disabled={!check.isSuccess} onClick={() => setPublishing(true)}>
              {course.publishedAt ? 'Publish again' : 'Publish'}
            </button>
          )}
        </div>
      </header>

      <section className="card course-admin__section" aria-label="Checks">
        <h2>Checks</h2>
        {check.isPending && <p className="meta">Checking…</p>}
        {check.isSuccess && !problems.length && <p className="meta">The checks found no problems.</p>}
        <CourseProblems problems={problems} />
        <p className="meta">{course.missingNoteAudio.length ? `${course.missingNoteAudio.length} notes have no audio yet.` : 'Every note has its audio.'}</p>
      </section>

      {course.publishedAt && course.status !== 'removed' && <VisibilityForm course={{ ...course, status: course.status }} />}
      <ClipLinksForm course={course} />

      {previewing && <LearnerPreview document={course.document} evals={course.evals} noteAudio={course.noteAudio} onClose={() => setPreviewing(false)} />}
      {publishing && <PublishDialog course={course} problems={problems} onClose={() => setPublishing(false)} />}
    </div>
  );
}
