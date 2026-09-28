import type { CourseDocument } from '@freechesscoach/shared';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { personaPlaybackRate } from '../../../tts/persona-voices.js';
import { noteAudioFile } from '../clip/note-audio-file.js';
import { openCourseAudioCache, prepareCourseAudio } from '../clip/prepare-audio.js';
import { COURSE_VOICE_LABELS, useCourseVoice, type CourseVoice } from '../clip/useCourseVoice.js';
import { CoursePlayer } from './CoursePlayer.js';

const cache = openCourseAudioCache();

/** Task 82.2, "Preview as learner": the public player on the draft, unsaved
 * edits included, nothing published. Each note is voiced when first played,
 * from the browser's cache (81.1) when it already has it, with the coach's
 * playback rate as the published file will have. */
export function LearnerPreview({ document, onClose }: { document: CourseDocument; onClose: () => void }): ReactNode {
  const { voice, setVoice, voices } = useCourseVoice();
  const urls = useRef(new Map<string, string>());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => window.document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const made = urls.current;
    return () => {
      made.forEach((url) => URL.revokeObjectURL(url));
      made.clear();
    };
  }, []);

  const source = useCallback(
    async (episodeId: string, nodeId: string): Promise<string | null> => {
      const key = `note:${episodeId}:${nodeId}`;
      const ply = document.episodes.find((episode) => episode.id === episodeId)?.plies.find((each) => each.nodeId === nodeId);
      const text = ply?.long ? ply.text : undefined;
      if (!text?.trim()) return null;
      const known = urls.current.get(`${voice}|${text}`);
      if (known) return known;
      const spoken = (await prepareCourseAudio({ document, backend: voice, cache, keys: new Set([key]) })).get(key);
      if (!spoken) return null;
      const url = URL.createObjectURL(await noteAudioFile(spoken, personaPlaybackRate(document.coachPersona, voice)));
      urls.current.set(`${voice}|${text}`, url);
      return url;
    },
    [document, voice]
  );

  return (
    <div className="learner-preview" role="dialog" aria-modal="true" aria-label="Preview as learner">
      <div className="learner-preview__bar">
        <strong>Preview as learner</strong>
        <label className="course-field learner-preview__voice">
          <span>Voice</span>
          <select value={voice} onChange={(event) => setVoice(event.target.value as CourseVoice)}>
            {voices.map((each) => (
              <option key={each} value={each}>
                {COURSE_VOICE_LABELS[each]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <CoursePlayer
        document={document}
        noteAudio={source}
        notice={<p className="course-player__notice">This is the draft as learners will see it once published. Notes are voiced the first time they play.</p>}
      />
    </div>
  );
}
