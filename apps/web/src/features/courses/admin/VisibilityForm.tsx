import type { CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/client.js';
import { useUpdateCourse } from './courseAdminApi.js';
import { ACCESS_LEVELS, accessLabel } from './PublishDialog.js';

type Visibility = 'draft' | 'unlisted' | 'public';

/** docs/courses.md §9: a published course's visibility and members' level,
 * changed without publishing the draft again. Draft takes it off the site. */
export function VisibilityForm({ course }: { course: CourseResponse & { status: Visibility } }): ReactNode {
  const update = useUpdateCourse(course.id);
  const [status, setStatus] = useState<Visibility>(course.status);
  const [accessLevel, setAccessLevel] = useState(course.accessLevel);
  return (
    <section className="card course-admin__section" aria-label="Visibility">
      <h2>Visibility</h2>
      <div className="course-admin__row">
        <label className="course-field">
          <span>On the site</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as Visibility)}>
            <option value="public">Public: listed on the site</option>
            <option value="unlisted">Unlisted: anyone with the link</option>
            <option value="draft">Off the site</option>
          </select>
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
        <button type="button" className="btn-primary" disabled={update.isPending} onClick={() => update.mutate({ status, accessLevel })}>
          Save
        </button>
      </div>
      {update.error && (
        <p className="course-admin__error" role="alert">
          {describeApiError(update.error) ?? 'Could not change the visibility.'}
        </p>
      )}
    </section>
  );
}
