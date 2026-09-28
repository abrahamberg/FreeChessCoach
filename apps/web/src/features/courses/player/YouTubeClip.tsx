import { useState, type ReactNode } from 'react';
import { youtubeVideoId } from './youtube.js';

/** The app runs cross-origin isolated (COEP, for the in-browser voice), so a
 * YouTube frame loads only as a `credentialless` iframe; browsers without
 * that open the video on YouTube instead. */
const canEmbed = typeof HTMLIFrameElement !== 'undefined' && 'credentialless' in HTMLIFrameElement.prototype;

/** The course's clip (docs/courses.md §9). Nothing loads from YouTube until
 * the learner presses play: just the thumbnail. */
export function YouTubeClip({ link, title, vertical }: { link: string; title: string; vertical: boolean }): ReactNode {
  const [playing, setPlaying] = useState(false);
  const id = youtubeVideoId(link);
  if (!id) return null;
  const className = vertical ? 'course-clip course-clip--vertical' : 'course-clip';

  if (playing) {
    return (
      <div className={className}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          {...{ credentialless: '' }}
        />
      </div>
    );
  }
  return (
    <div className={className}>
      <button
        type="button"
        className="course-clip__poster"
        aria-label={`Play the clip: ${title}`}
        onClick={() => (canEmbed ? setPlaying(true) : window.open(link, '_blank', 'noopener,noreferrer'))}
      >
        <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
        <span className="course-clip__play" aria-hidden="true">
          ▶
        </span>
      </button>
    </div>
  );
}
