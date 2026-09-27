import type { CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { isGenerating, useStartCourseGeneration } from './courseApi.js';

export interface CourseGenerationBarProps {
  course: CourseResponse;
  /** Unsaved edits: the job writes over the server's copy, so save first. */
  dirty: boolean;
}

/** "Write with AI" and the job's progress (docs/courses.md §5.2). A failed
 * run resumes, keeping the episodes it finished. */
export function CourseGenerationBar({ course, dirty }: CourseGenerationBarProps): ReactNode {
  const start = useStartCourseGeneration(course.id);
  const [confirm, setConfirm] = useState(false);
  const generation = course.generation;
  const running = isGenerating(course);
  const resumable = generation?.status === 'failed' && generation.outline !== null;
  const courseWarnings = generation?.warnings.filter((warning) => warning.episodeId === null) ?? [];

  const begin = (restart: boolean): void => {
    setConfirm(false);
    start.mutate({ restart });
  };

  return (
    <div className="course-generation">
      <div className="course-editor__actions">
        {resumable && (
          <button type="button" className="btn-primary" disabled={dirty || start.isPending} onClick={() => begin(false)}>
            Resume writing
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={dirty || running || start.isPending}
          title={dirty ? 'Save your changes first' : undefined}
          onClick={() => (course.document.episodes.length ? setConfirm(true) : begin(true))}
        >
          Write with AI
        </button>
      </div>
      {running && (
        <p className="meta" role="status">
          {generation?.step ?? 'Waiting for the writer…'}
          {generation && generation.total > 0 ? ` (${generation.done} of ${generation.total} done)` : ''}
        </p>
      )}
      {generation?.status === 'failed' && (
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
      {confirm && (
        <ConfirmDialog
          title="Write the course with AI?"
          description="Your AI plans the episodes and writes every clip and note. This replaces the current chapters and episodes."
          confirmLabel="Write it"
          onConfirm={() => begin(true)}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
