import { COURSE_MAX_ACCESS_LEVEL, type CourseCheckProblem, type CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/client.js';
import { Modal } from '../../../components/Modal.js';
import { usePublishCourse } from './courseAdminApi.js';
import { CourseProblems } from './CourseProblems.js';

/** 0 is everyone; 1..max are the members' levels (docs/courses.md §9). */
export const ACCESS_LEVELS = Array.from({ length: COURSE_MAX_ACCESS_LEVEL + 1 }, (_, level) => level);

export function accessLabel(level: number): string {
  return level === 0 ? 'Everyone' : `Members only: level ${level} and up`;
}

/** docs/courses.md §9: who sees it, the checks, then the draft becomes the
 * published copy. Problems must be ticked "I checked these". */
export function PublishDialog({ course, problems, onClose }: { course: CourseResponse; problems: CourseCheckProblem[]; onClose: () => void }): ReactNode {
  const publish = usePublishCourse(course.id);
  const [visibility, setVisibility] = useState<'unlisted' | 'public'>(course.status === 'public' ? 'public' : 'unlisted');
  const [accessLevel, setAccessLevel] = useState(course.accessLevel);
  const [checked, setChecked] = useState(false);
  const ready = !problems.length || checked;

  return (
    <Modal title={course.publishedAt ? 'Publish again' : 'Publish'} onClose={publish.isPending ? () => undefined : onClose}>
      <div className="publish-dialog">
        <fieldset className="publish-dialog__group" disabled={publish.isPending}>
          <legend>Who can see it</legend>
          <label className="publish-dialog__choice">
            <input type="radio" name="visibility" checked={visibility === 'unlisted'} onChange={() => setVisibility('unlisted')} />
            Unlisted: anyone with the link
          </label>
          <label className="publish-dialog__choice">
            <input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
            Public: listed on the site
          </label>
          <label className="course-field">
            <span>Who can open it</span>
            <select value={accessLevel} onChange={(event) => setAccessLevel(Number(event.target.value))}>
              {ACCESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {accessLabel(level)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {course.missingNoteAudio.length > 0 && <p className="meta course-admin__warning">{course.missingNoteAudio.length} notes have no audio yet: learners hear them in their own chosen voice.</p>}
        <CourseProblems problems={problems} />
        {problems.length > 0 && (
          <label className="publish-dialog__choice">
            <input type="checkbox" checked={checked} disabled={publish.isPending} onChange={(event) => setChecked(event.target.checked)} />I checked these
          </label>
        )}
        {publish.error && (
          <p className="course-admin__error" role="alert">
            {describeApiError(publish.error) ?? 'Could not publish.'}
          </p>
        )}
        <div className="publish-dialog__actions">
          <button type="button" className="btn-secondary" disabled={publish.isPending} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={publish.isPending || !ready} onClick={() => publish.mutate({ visibility, accessLevel, warningsChecked: checked }, { onSuccess: onClose })}>
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
