import { REEL_WARNINGS, type CourseResponse } from '@freechesscoach/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { usePageMenuItems } from '../../components/PageMenu.js';
import { isGenerating, useStartCourseGeneration } from './courseApi.js';
import { CourseDebugPanel } from './CourseDebugPanel.js';

export interface CourseGenerationBarProps {
  course: CourseResponse;
  /** Unsaved edits: the job writes over the server's copy, so save first. */
  dirty: boolean;
}

/** "Write with AI" on an empty course, and the job's progress (docs/courses.md
 * §5.2). A failed run resumes, keeping the episodes it finished; a written
 * course starts over from the editor's menu (Phase 90). */
export function CourseGenerationBar({ course, dirty }: CourseGenerationBarProps): ReactNode {
  const start = useStartCourseGeneration(course.id);
  const [debugOpen, setDebugOpen] = useState(false);
  // The chat's menu item, in the avatar menu: every AI call of the latest run.
  const hasRun = course.generation !== null;
  const menuItems = useMemo(() => [{ label: 'Debug last answer', onSelect: () => setDebugOpen(true), disabled: !hasRun }], [hasRun]);
  usePageMenuItems(menuItems);
  const generation = course.generation;
  const running = isGenerating(course);
  const resumable = generation?.status === 'failed' && generation.outline !== null;
  // The whole course's warnings, and the reel's (§13.3), which has no episode.
  const courseWarnings = generation?.warnings.filter((warning) => warning.episodeId === null || warning.episodeId === REEL_WARNINGS) ?? [];

  const begin = (restart: boolean): void => {
    start.mutate({ restart });
  };
  const empty = !course.document.episodes.length && !running;
  const debug = debugOpen && <CourseDebugPanel courseId={course.id} generating={running} onClose={() => setDebugOpen(false)} />;
  const failed = generation?.status === 'failed';
  // Above every section of the editor: nothing when there is nothing to say.
  if (!empty && !running && !failed && !start.error && !courseWarnings.length) return debug || null;

  return (
    <div className="course-generation">
      <div className="course-editor__actions">
        {resumable && (
          <button type="button" className="btn-primary" disabled={dirty || start.isPending} onClick={() => begin(false)}>
            Resume writing
          </button>
        )}
        {/* A written course starts over from the editor's "⋮" menu instead. */}
        {empty && (
          <button type="button" className="btn-primary" disabled={dirty || start.isPending} title={dirty ? 'Save your changes first' : undefined} onClick={() => begin(true)}>
            Write with AI
          </button>
        )}
      </div>
      {running && (
        <p className="meta" role="status">
          {generation?.step ?? 'Waiting for the writer…'}
          {generation && generation.total > 0 ? ` (${generation.done} of ${generation.total} done)` : ''}
        </p>
      )}
      {failed && (
        <p className="course-intake__errors" role="alert">
          {generation.error ?? 'Writing stopped.'}
        </p>
      )}
      {start.error && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(start.error) ?? 'Could not start writing.'}
        </p>
      )}
      {courseWarnings.map((warning) => (
        <p key={warning.message} className="course-warnings meta">
          {warning.message}
        </p>
      ))}
      {debug}
    </div>
  );
}
