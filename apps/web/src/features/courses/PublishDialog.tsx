import { COURSE_MAX_ACCESS_LEVEL, type CourseCheckProblem, type CourseClipLinks, type CourseDocument, type CourseResponse } from '@freechesscoach/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { Modal } from '../../components/Modal.js';
import { personaPlaybackRate } from '../../tts/persona-voices.js';
import { fetchCourse, fetchPublishCheck, uploadNoteAudio, usePublishCourse, useSaveCourseDraft } from './courseApi.js';
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

/** 0 is everyone; 1..max are the members' levels (docs/courses.md §9). */
const ACCESS_LEVELS = Array.from({ length: COURSE_MAX_ACCESS_LEVEL + 1 }, (_, level) => level);

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
  const [accessLevel, setAccessLevel] = useState(course.accessLevel);
  const [checked, setChecked] = useState(false);
  /** The full checks, with the engine facts, over the saved draft; null until read. */
  const [problems, setProblems] = useState<CourseCheckProblem[] | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublishCheck(course.id).then((result) => setProblems(result.problems), () => setProblems(null));
  }, [course.id]);
  const mustTick = (problems?.length ?? 0) > 0;
  const ready = takeaways.every((takeaway) => takeaway.trim()) && (!mustTick || checked);

  async function run(): Promise<void> {
    setError(null);
    const clipLinks = Object.fromEntries(Object.entries(links).filter(([, value]) => value?.trim())) as CourseClipLinks;
    const next = { ...document, takeaways: takeaways.map((takeaway) => takeaway.trim()), clipLinks };
    try {
      setStep('Saving the draft…');
      await save.mutateAsync(next);
      onDocumentChange(next);
      // Before anything is voiced: what the checks find now, with the engine facts.
      const found = (await fetchPublishCheck(course.id)).problems;
      setProblems(found);
      if (found.length > 0 && !checked) {
        setError(`The checks found ${found.length === 1 ? 'one problem' : `${found.length} problems`}. Read them below, fix the text or tick "I checked these", then publish.`);
        setStep(null);
        return;
      }
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
      await publish.mutateAsync({ visibility, accessLevel, warningsChecked: checked });
      onPublished();
    } catch (failure) {
      setError(describeApiError(failure) ?? (failure instanceof Error ? failure.message : 'Could not publish.'));
      setStep(null);
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
          <label className="course-field">
            <span>Who can open it</span>
            <select value={accessLevel} onChange={(event) => setAccessLevel(Number(event.target.value))}>
              {ACCESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level === 0 ? 'Everyone' : `Members only: level ${level} and up`}
                </option>
              ))}
            </select>
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
        {problems && problems.length > 0 && (
          <div className="publish-dialog__checks">
            <p>The checks found {problems.length === 1 ? 'one problem' : `${problems.length} problems`}:</p>
            <ul>
              {problems.map((problem, index) => (
                <li key={index}>
                  <strong>
                    {problem.episode}
                    {problem.move ? `, ${problem.move}` : ''}
                    {problem.nodeId ? ` (${problem.nodeId})` : ''}
                  </strong>
                  : {problem.message}
                </li>
              ))}
            </ul>
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
