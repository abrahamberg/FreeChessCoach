import { verifyCourseEpisode } from '@freechesscoach/chess-analysis';
import type { CourseClipLinks, CourseDocument, CourseResponse } from '@freechesscoach/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { Modal } from '../../components/Modal.js';
import { personaPlaybackRate } from '../../tts/persona-voices.js';
import { fetchCourse, uploadNoteAudio, usePublishCourse, useSaveCourseDraft } from './courseApi.js';
import { noteAudioFile } from './clip/note-audio-file.js';
import { openCourseAudioCache, prepareCourseAudio } from './clip/prepare-audio.js';
import { COURSE_VOICE_LABELS, useCourseVoice, type CourseVoice } from './clip/useCourseVoice.js';

export interface PublishDialogProps {
  course: CourseResponse;
  document: CourseDocument;
  /** The editor's draft changes with the takeaways and clip links set here. */
  onDocumentChange: (document: CourseDocument) => void;
  onPublished: () => void;
  onClose: () => void;
}

const LINKS: { key: keyof CourseClipLinks; label: string; placeholder: string }[] = [
  { key: 'youtube', label: 'YouTube video', placeholder: 'https://www.youtube.com/watch?v=…' },
  { key: 'shorts', label: 'Reel on YouTube Shorts', placeholder: 'https://www.youtube.com/shorts/…' },
  { key: 'instagram', label: 'Reel on Instagram', placeholder: 'https://www.instagram.com/reel/…' },
  { key: 'tiktok', label: 'Reel on TikTok', placeholder: 'https://www.tiktok.com/@you/video/…' }
];

const cache = openCourseAudioCache();

/** docs/courses.md §9: the three takeaways, where the clips were posted, who
 * sees it, the checks; then save, voice the notes that have no audio yet,
 * upload them, and publish. */
export function PublishDialog({ course, document, onDocumentChange, onPublished, onClose }: PublishDialogProps): ReactNode {
  const save = useSaveCourseDraft(course.id);
  const publish = usePublishCourse(course.id);
  const { voice, setVoice, voices } = useCourseVoice();
  const [takeaways, setTakeaways] = useState<string[]>([0, 1, 2].map((index) => document.takeaways[index] ?? ''));
  const [links, setLinks] = useState<CourseClipLinks>(document.clipLinks);
  const [visibility, setVisibility] = useState<'unlisted' | 'public'>(course.status === 'public' ? 'public' : 'unlisted');
  const [checked, setChecked] = useState(false);
  /** The server's checks use the engine facts too, so they can find more. */
  const [serverFound, setServerFound] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const problems = useMemo(
    () =>
      document.episodes.flatMap((episode) =>
        verifyCourseEpisode({ episode, startFen: document.startFen, nodes: document.nodes, dossier: null, direction: course.direction }).map((problem) => `${episode.role}: ${problem.message}`)
      ),
    [document, course.direction]
  );
  const mustTick = problems.length > 0 || serverFound;
  const ready = takeaways.every((takeaway) => takeaway.trim()) && (!mustTick || checked);

  async function run(): Promise<void> {
    setError(null);
    const clipLinks = Object.fromEntries(Object.entries(links).filter(([, value]) => value?.trim())) as CourseClipLinks;
    const next = { ...document, takeaways: takeaways.map((takeaway) => takeaway.trim()), clipLinks };
    try {
      setStep('Saving the draft…');
      await save.mutateAsync(next);
      onDocumentChange(next);
      const saved = await fetchCourse(course.id);
      const keys = new Set(saved.missingNoteAudio.map(({ episodeId, nodeId }) => `note:${episodeId}:${nodeId}`));
      if (keys.size) {
        const audio = await prepareCourseAudio({
          document: next,
          backend: voice,
          cache,
          keys,
          onProgress: ({ done, total }) => setStep(`Voicing the notes: ${done} of ${total}`)
        });
        const rate = personaPlaybackRate(next.coachPersona, voice);
        let sent = 0;
        for (const { episodeId, nodeId } of saved.missingNoteAudio) {
          const spoken = audio.get(`note:${episodeId}:${nodeId}`);
          if (!spoken) continue;
          setStep(`Uploading the note audio: ${++sent} of ${keys.size}`);
          await uploadNoteAudio(course.id, episodeId, nodeId, await noteAudioFile(spoken, rate));
        }
      }
      setStep('Publishing…');
      await publish.mutateAsync({ visibility, warningsChecked: checked });
      onPublished();
    } catch (failure) {
      setError(describeApiError(failure) ?? (failure instanceof Error ? failure.message : 'Could not publish.'));
      setStep(null);
      if (/tick "I checked these"/.test(String(describeApiError(failure)))) setServerFound(true);
    }
  }

  const busy = step !== null;
  return (
    <Modal title={course.publishedAt ? 'Publish again' : 'Publish'} onClose={busy ? () => undefined : onClose}>
      <div className="publish-dialog">
        <fieldset className="publish-dialog__group" disabled={busy}>
          <legend>Three takeaways</legend>
          {takeaways.map((takeaway, index) => (
            <input
              key={index}
              value={takeaway}
              maxLength={160}
              placeholder={`Takeaway ${index + 1}`}
              aria-label={`Takeaway ${index + 1}`}
              onChange={(event) => setTakeaways(takeaways.map((each, at) => (at === index ? event.target.value : each)))}
            />
          ))}
        </fieldset>
        <fieldset className="publish-dialog__group" disabled={busy}>
          <legend>Who can see it</legend>
          <label className="publish-dialog__choice">
            <input type="radio" name="visibility" checked={visibility === 'unlisted'} onChange={() => setVisibility('unlisted')} />
            Unlisted: anyone with the link
          </label>
          <label className="publish-dialog__choice">
            <input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
            Public: listed on the site
          </label>
        </fieldset>
        <fieldset className="publish-dialog__group" disabled={busy}>
          <legend>Where you posted the videos (optional)</legend>
          {LINKS.map(({ key, label, placeholder }) => (
            <label key={key} className="course-field">
              <span>{label}</span>
              <input type="url" value={links[key] ?? ''} placeholder={placeholder} onChange={(event) => setLinks({ ...links, [key]: event.target.value })} />
            </label>
          ))}
        </fieldset>
        <label className="course-field">
          <span>Voice for the notes</span>
          <select value={voice} disabled={busy} onChange={(event) => setVoice(event.target.value as CourseVoice)}>
            {voices.map((each) => (
              <option key={each} value={each}>
                {COURSE_VOICE_LABELS[each]}
              </option>
            ))}
          </select>
        </label>
        {course.missingNoteAudio.length > 0 && <p className="meta">{course.missingNoteAudio.length} notes will be voiced before publishing (cached sentences are quick).</p>}
        {problems.length > 0 && (
          <div className="publish-dialog__checks">
            <p>The checks found {problems.length === 1 ? 'one problem' : `${problems.length} problems`}:</p>
            <ul>
              {problems.slice(0, 8).map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
            {problems.length > 8 && <p className="meta">…and {problems.length - 8} more, shown on each episode.</p>}
          </div>
        )}
        {mustTick && (
          <label className="publish-dialog__choice">
            <input type="checkbox" checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} />I checked these
          </label>
        )}
        {step && <p className="meta" role="status">{step}</p>}
        {error && (
          <p className="course-intake__errors" role="alert">
            {error}
          </p>
        )}
        <div className="publish-dialog__actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy || !ready} onClick={() => void run()}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
