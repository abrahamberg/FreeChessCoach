import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { moveLabel } from './courseEdits.js';

export interface CourseOutlineProps {
  document: CourseDocument;
  selectedEpisodeId: string | null;
  onSelectEpisode: (episodeId: string) => void;
}

/** Left column: chapters, each with its episodes, numbered through the
 * course, with their moves and whether they ask a quiz. */
export function CourseOutline({ document, selectedEpisodeId, onSelectEpisode }: CourseOutlineProps): ReactNode {
  const episodes = new Map(document.episodes.map((episode) => [episode.id, episode]));
  const number = new Map(document.episodes.map((episode, index) => [episode.id, index + 1]));
  if (!document.chapters.length) {
    return (
      <nav className="course-outline" aria-label="Episodes">
        <p className="meta">No episodes yet. “Build without AI” starts them from the checked facts of your PGN.</p>
      </nav>
    );
  }
  return (
    <nav className="course-outline" aria-label="Episodes">
      {document.chapters.map((chapter) => (
        <section key={chapter.id} className="course-outline__chapter">
          <h3>{chapter.title}</h3>
          <ul>
            {chapter.episodeIds.map((episodeId) => {
              const episode = episodes.get(episodeId);
              if (!episode) return null;
              const selected = episode.id === selectedEpisodeId;
              return (
                <li key={episode.id}>
                  <button
                    type="button"
                    className={selected ? 'course-outline__item course-outline__item--selected' : 'course-outline__item'}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelectEpisode(episode.id)}
                  >
                    <span className="course-outline__number">{number.get(episode.id)}</span>
                    <span className="course-outline__body">
                      <span className="course-outline__head">
                        <span className="course-outline__role">{episode.role}</span>
                        {episode.quiz && <span className="course-outline__quiz">Quiz</span>}
                      </span>
                      <span className="course-outline__focus">{episode.focus}</span>
                      <span className="course-outline__moves">{moveRange(document, episode)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** "1.Rd1+ – 7.Rb4", or the one move. */
function moveRange(document: CourseDocument, episode: CourseEpisode): string {
  const label = (nodeId: string): string => {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    return node ? moveLabel(document, node) : '';
  };
  const start = label(episode.startNodeId);
  const end = label(episode.endNodeId);
  return start === end ? start : `${start} – ${end}`;
}
