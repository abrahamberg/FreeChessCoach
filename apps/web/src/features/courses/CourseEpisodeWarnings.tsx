import { verifyCourseEpisode } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { useMemo, type ReactNode } from 'react';

export interface CourseEpisodeWarningsProps {
  document: CourseDocument;
  episode: CourseEpisode;
  direction: string;
}

/** The verifier's problems with this episode (docs/courses.md §7), live as
 * the creator edits. No engine analysis here, so moves are checked for
 * legality and tactic words are not checked. */
export function CourseEpisodeWarnings({ document, episode, direction }: CourseEpisodeWarningsProps): ReactNode {
  const problems = useMemo(
    () => verifyCourseEpisode({ episode, startFen: document.startFen, nodes: document.nodes, dossier: null, direction }),
    [document.startFen, document.nodes, episode, direction]
  );
  if (problems.length === 0) return null;

  return (
    <section className="course-panel__section course-warnings" aria-label="Checks">
      <h3>Checks</h3>
      <ul>
        {problems.map((problem, index) => (
          <li key={`${problem.code}-${index}`}>{problem.message}</li>
        ))}
      </ul>
    </section>
  );
}
