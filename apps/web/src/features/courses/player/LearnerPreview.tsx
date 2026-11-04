import type { CourseDocument } from '@freechesscoach/shared';
import { useCallback, useEffect, type ReactNode } from 'react';
import type { CourseEvals } from './course-move-list.js';
import { CoursePlayer } from './CoursePlayer.js';

/** "Preview as learner" (docs/courses.md §9): the public player on the
 * draft, nothing published, with the audio files the studio uploaded for
 * its notes (`<episodeId>:<nodeId>` → URL) and the engine's evaluations. */
export function LearnerPreview({ document, evals, noteAudio, onClose }: { document: CourseDocument; evals: CourseEvals; noteAudio: Record<string, string>; onClose: () => void }): ReactNode {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => window.document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const source = useCallback((episodeId: string, nodeId: string) => Promise.resolve(noteAudio[`${episodeId}:${nodeId}`] ?? null), [noteAudio]);

  return (
    <div className="learner-preview" role="dialog" aria-modal="true" aria-label="Preview as learner">
      <div className="learner-preview__bar">
        <strong>Preview as learner</strong>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <CoursePlayer
        document={document}
        noteAudio={source}
        evals={evals}
        notice={<p className="course-player__notice">This is the draft as learners will see it once published.</p>}
      />
    </div>
  );
}
