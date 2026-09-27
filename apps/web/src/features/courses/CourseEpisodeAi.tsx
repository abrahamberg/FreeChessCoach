import type { CourseGeneration } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { useRegenerateEpisode } from './courseApi.js';

export interface CourseEpisodeAiProps {
  courseId: string;
  episodeId: string;
  generation: CourseGeneration | null;
  dirty: boolean;
}

/** The AI's checks on this episode as it was written (§7), and "Regenerate"
 * with the creator's instruction (§6.5). Shown only once the AI wrote the course. */
export function CourseEpisodeAi({ courseId, episodeId, generation, dirty }: CourseEpisodeAiProps): ReactNode {
  const regenerate = useRegenerateEpisode(courseId);
  const [instruction, setInstruction] = useState('');
  if (!generation?.outline) return null;
  const warnings = generation.warnings.filter((warning) => warning.episodeId === episodeId);
  const busy = generation.status === 'queued' || generation.status === 'running';

  return (
    <section className="course-panel__section" aria-label="AI writer">
      <h3>AI writer</h3>
      {warnings.length > 0 && (
        <div className="course-warnings">
          <ul>
            {warnings.map((warning) => (
              <li key={warning.message}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      <input value={instruction} maxLength={300} placeholder="Punchier, simpler words, mention the pin earlier…" onChange={(event) => setInstruction(event.target.value)} />
      <button
        type="button"
        className="btn-secondary"
        disabled={dirty || busy || regenerate.isPending}
        title={dirty ? 'Save your changes first' : undefined}
        onClick={() => regenerate.mutate({ episodeId, instruction }, { onSuccess: () => setInstruction('') })}
      >
        {regenerate.isPending ? 'Rewriting…' : 'Regenerate this episode'}
      </button>
      {regenerate.error && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(regenerate.error) ?? 'Could not rewrite the episode.'}
        </p>
      )}
    </section>
  );
}
