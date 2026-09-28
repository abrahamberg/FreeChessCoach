import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import type { Database } from '../../db/schema.js';
import { mirrorKey, type AudioMirror } from './audio-mirror.js';

/** docs/courses.md §9, after a publish: copies every file the mirror lacks
 * (new, or re-voiced since), then deletes files no stored note uses any more
 * (`dropped`: what the mirror held for rows the publish removed). Identical
 * bytes share one object, so a file goes only when no row still has it. A
 * failure stops the sync; rows copied so far stay marked, and the next
 * publish carries on. The page falls back to the api for unmarked rows. */
export async function syncCourseAudio(db: Kysely<Database>, mirror: AudioMirror, course: { id: string; slug: string }, dropped: string[]): Promise<void> {
  const files = await courseAudioRepo.files(db, course.id);
  const stale = new Set(dropped);
  for (const file of files) {
    if (file.mirroredHash === file.contentHash) continue;
    const audio = await courseAudioRepo.findByContent(db, course.id, file.contentHash);
    if (!audio) continue;
    await mirror.put(mirrorKey(course.slug, file.contentHash), audio.bytes, audio.mimeType);
    await courseAudioRepo.setMirrored(db, course.id, file.textHash, file.contentHash);
    if (file.mirroredHash) stale.add(file.mirroredHash);
  }
  const kept = new Set(files.map((file) => file.contentHash));
  for (const hash of stale) {
    if (!kept.has(hash)) await mirror.delete(mirrorKey(course.slug, hash));
  }
}

/** Where a learner fetches one note's file: the mirror when it holds these
 * exact bytes, else the api. */
export function audioFileUrl(mirror: AudioMirror | undefined, slug: string, file: courseAudioRepo.CourseAudioFile): string {
  return mirror && file.mirroredHash === file.contentHash ? `${mirror.publicUrl}/${mirrorKey(slug, file.contentHash)}` : `/api/public/${mirrorKey(slug, file.contentHash)}`;
}
