import { courseVideos, REEL_WARNINGS, type CourseDocument, type CourseGeneration, type CourseReel, type CourseVideo } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { useWriteReel } from './courseApi.js';
import { moveLabel } from './courseEdits.js';

export interface CourseProductsProps {
  courseId: string;
  document: CourseDocument;
  generation: CourseGeneration | null;
  dirty: boolean;
  onChange: (document: CourseDocument) => void;
}

const EMPTY_VIDEO: CourseVideo = { title: '', thumbnailText: '', hook: '', outro: '' };

const VIDEO_FIELDS: { field: keyof CourseVideo; label: string; hint: string; rows?: number }[] = [
  { field: 'title', label: 'Title', hint: 'At most 55 characters: curiosity and clarity.' },
  { field: 'thumbnailText', label: 'Thumbnail text', hint: 'At most 4 words.' },
  { field: 'hook', label: 'Hook', hint: 'The first 15 seconds: the premise or the climax, never “welcome back”.', rows: 3 },
  { field: 'outro', label: 'Outro', hint: 'A question for the comments, then what comes next.', rows: 2 }
];

const REEL_TEXTS: { field: 'topText' | 'hook' | 'payoff' | 'cta' | 'loop'; label: string }[] = [
  { field: 'topText', label: 'Top text (stays on screen)' },
  { field: 'hook', label: 'Hook (the first 2 seconds)' },
  { field: 'payoff', label: 'Payoff' },
  { field: 'cta', label: 'Call to action' },
  { field: 'loop', label: 'Loop line' }
];

/** docs/courses.md §13: the YouTube video's packaging and the reel, each
 * shown when the course makes it (the Videos choice in Details). */
export function CourseProducts({ courseId, document, generation, dirty, onChange }: CourseProductsProps): ReactNode {
  const videos = courseVideos(document);
  return (
    <>
      {videos.video && <VideoCard document={document} onChange={onChange} />}
      {videos.reel && <ReelCard courseId={courseId} document={document} generation={generation} dirty={dirty} onChange={onChange} />}
    </>
  );
}

function VideoCard({ document, onChange }: { document: CourseDocument; onChange: (document: CourseDocument) => void }): ReactNode {
  const video = document.video ?? EMPTY_VIDEO;
  // A video added by hand has no planned budgets: the AI plans it with the course.
  const planned = document.episodes.some((episode) => (episode.budget?.video ?? 0) > 0);
  return (
    <section className="course-panel course-products" aria-label="YouTube video">
      <h3>YouTube video</h3>
      {!planned && <p className="meta course-details__hint">The video is not planned yet. Start over and write it again with AI to plan it with every episode, or tick moves “In the video” by hand.</p>}
      {VIDEO_FIELDS.map(({ field, label, hint, rows }) => (
        <label key={field} className="course-field">
          <span>{label}</span>
          {rows ? (
            <textarea rows={rows} value={video[field]} placeholder={hint} onChange={(event) => onChange({ ...document, video: { ...video, [field]: event.target.value } })} />
          ) : (
            <input value={video[field]} placeholder={hint} onChange={(event) => onChange({ ...document, video: { ...video, [field]: event.target.value } })} />
          )}
        </label>
      ))}
    </section>
  );
}

function ReelCard({ courseId, document, generation, dirty, onChange }: CourseProductsProps): ReactNode {
  const write = useWriteReel(courseId);
  const reel = document.reel;
  const busy = generation?.status === 'queued' || generation?.status === 'running';
  const warnings = generation?.warnings.filter((warning) => warning.episodeId === REEL_WARNINGS) ?? [];
  const set = (patch: Partial<CourseReel>): void => {
    if (reel) onChange({ ...document, reel: { ...reel, ...patch } });
  };
  const label = (nodeId: string): string => {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    return node ? moveLabel(document, node) : nodeId;
  };

  return (
    <section className="course-panel course-products" aria-label="Reel">
      <h3>Reel</h3>
      {reel ? (
        <>
          <div className="course-products__row">
            <label className="course-field">
              <span>Style</span>
              <select value={reel.style} onChange={(event) => set({ style: event.target.value as CourseReel['style'] })}>
                <option value="highlight">Highlight</option>
                <option value="puzzle">Puzzle</option>
                <option value="promo">Promo</option>
              </select>
            </label>
            <span className="meta course-products__span">
              {label(reel.startNodeId)} → <strong>{label(reel.climaxNodeId)}</strong> → {label(reel.endNodeId)}
            </span>
          </div>
          {REEL_TEXTS.map(({ field, label: text }) => (
            <label key={field} className="course-field">
              <span>{text}</span>
              <input value={reel[field]} onChange={(event) => set({ [field]: event.target.value })} />
            </label>
          ))}
          {reel.beats.map((beat, index) => (
            <div key={beat.nodeId} className="course-products__beat">
              <strong>{label(beat.nodeId)}</strong>
              <input aria-label={`${label(beat.nodeId)} says`} value={beat.say} placeholder="Says" onChange={(event) => set({ beats: reel.beats.map((each, at) => (at === index ? { ...each, say: event.target.value } : each)) })} />
              <input aria-label={`${label(beat.nodeId)} caption`} value={beat.caption} placeholder="Caption" onChange={(event) => set({ beats: reel.beats.map((each, at) => (at === index ? { ...each, caption: event.target.value } : each)) })} />
            </div>
          ))}
        </>
      ) : (
        <p className="meta">No reel yet. The AI picks the moment from the analysis and writes it.</p>
      )}
      {warnings.length > 0 && (
        <div className="course-warnings">
          <ul>
            {warnings.map((warning) => (
              <li key={warning.message}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn-secondary" disabled={dirty || busy || write.isPending} title={dirty ? 'Save your changes first' : undefined} onClick={() => write.mutate()}>
        {write.isPending ? 'Writing the reel…' : reel ? 'Write the reel again with AI' : 'Write the reel with AI'}
      </button>
      {write.error && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(write.error) ?? 'Could not write the reel.'}
        </p>
      )}
    </section>
  );
}
