import type { CourseClipLinks, CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/client.js';
import { useUpdateCourse } from './courseAdminApi.js';

const LINKS: { key: keyof CourseClipLinks; label: string; placeholder: string }[] = [
  { key: 'youtube', label: 'YouTube video', placeholder: 'https://www.youtube.com/watch?v=…' },
  { key: 'shorts', label: 'Reel on YouTube Shorts', placeholder: 'https://www.youtube.com/shorts/…' },
  { key: 'instagram', label: 'Reel on Instagram', placeholder: 'https://www.instagram.com/reel/…' },
  { key: 'tiktok', label: 'Reel on TikTok', placeholder: 'https://www.tiktok.com/@you/video/…' }
];

/** docs/courses.md §8: where the course's videos were posted; the course
 * page plays them. Saved on the draft and the published copy alike. */
export function ClipLinksForm({ course }: { course: CourseResponse }): ReactNode {
  const update = useUpdateCourse(course.id);
  const [links, setLinks] = useState<CourseClipLinks>(course.document.clipLinks);
  const save = (): void => {
    const clipLinks = Object.fromEntries(Object.entries(links).filter(([, value]) => value?.trim())) as CourseClipLinks;
    update.mutate({ clipLinks });
  };
  return (
    <section className="card course-admin__section" aria-label="Posted videos">
      <h2>Posted videos</h2>
      {LINKS.map(({ key, label, placeholder }) => (
        <label key={key} className="course-field">
          <span>{label}</span>
          <input type="url" value={links[key] ?? ''} placeholder={placeholder} onChange={(event) => setLinks({ ...links, [key]: event.target.value })} />
        </label>
      ))}
      {update.error && (
        <p className="course-admin__error" role="alert">
          {describeApiError(update.error) ?? 'Could not save the links.'}
        </p>
      )}
      <div className="course-admin__row">
        <button type="button" className="btn-primary" disabled={update.isPending} onClick={save}>
          Save links
        </button>
        {update.isSuccess && <span className="meta" role="status">Saved.</span>}
      </div>
    </section>
  );
}
