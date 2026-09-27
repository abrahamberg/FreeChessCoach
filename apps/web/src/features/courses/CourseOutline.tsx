import type { CourseDocument } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export interface CourseOutlineProps {
  document: CourseDocument;
  selectedEpisodeId: string | null;
  onSelectEpisode: (episodeId: string) => void;
}

/** Left column: chapters, each with its episodes. */
export function CourseOutline({ document, selectedEpisodeId, onSelectEpisode }: CourseOutlineProps): ReactNode {
  const episodes = new Map(document.episodes.map((episode) => [episode.id, episode]));
  if (!document.chapters.length) {
    return (
      <nav className="course-outline" aria-label="Chapters">
        <p className="meta">No episodes yet. “Build without AI” starts them from the checked facts of your PGN.</p>
      </nav>
    );
  }
  return (
    <nav className="course-outline" aria-label="Chapters">
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
                    <span className="course-outline__role">{episode.role}</span>
                    <span className="course-outline__focus">{episode.focus}</span>
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
