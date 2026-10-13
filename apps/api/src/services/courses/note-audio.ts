import { createHash } from 'node:crypto';
import { CONFIG } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { audioKeyPrefix, newAudioKey, type AudioStore } from './audio-store.js';

/** Course notes are voiced by Kokoro only (docs/courses.md §8), encoded in the
 * creator's browser and uploaded as MP3 straight to the bucket: visitors fetch
 * these, so they stay small. */
export const NOTE_AUDIO_TYPE = 'audio/mpeg';

/** A note's audio is found by its exact text: edit the note, and it needs new audio. */
export function noteTextHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/** Every move that speaks in the course (the long version), and its
 * text's hash. The clip's lines are voiced in the creator's browser when it
 * records, never uploaded. */
export function noteHashes(document: CourseDocument): { episodeId: string; nodeId: string; hash: string }[] {
  return document.episodes.flatMap((episode) =>
    episode.plies.flatMap((ply) => (ply.course && ply.text.trim() ? [{ episodeId: episode.id, nodeId: ply.nodeId, hash: noteTextHash(ply.text) }] : []))
  );
}

export async function missingNoteAudio(db: Kysely<Database>, courseId: string, document: CourseDocument): Promise<CourseResponse['missingNoteAudio']> {
  const stored = new Set((await courseAudioRepo.files(db, courseId)).map((file) => file.textHash));
  return noteHashes(document)
    .filter((note) => !stored.has(note.hash))
    .map(({ episodeId, nodeId }) => ({ episodeId, nodeId }));
}

function noteOf(document: CourseDocument, target: { episodeId: string; nodeId: string }): { hash: string } {
  const note = noteHashes(document).find((each) => each.episodeId === target.episodeId && each.nodeId === target.nodeId);
  if (!note) throw new NotFoundError('That note is not in the draft');
  return note;
}

/** docs/courses.md §8: a signed URL the browser uploads one note's MP3 to, as
 * the note's draft text reads now. The object key is made here, so the browser
 * can only write the one file asked for, of the size it declared, within the caps. */
export async function requestNoteAudioUpload(
  db: Kysely<Database>,
  store: AudioStore | undefined,
  course: { id: string; slug: string },
  document: CourseDocument,
  target: { episodeId: string; nodeId: string },
  size: number
): Promise<{ url: string; key: string }> {
  if (!store) throw new ValidationError('Audio storage is not configured on this server');
  const note = noteOf(document, target);
  if (size > CONFIG.courses.maxNoteAudioBytes) throw new ValidationError('That note is too long to voice; shorten it');
  await checkCourseCap(db, course.id, note.hash, size);
  const key = newAudioKey(course.slug);
  return { url: store.presignUpload(key, NOTE_AUDIO_TYPE, size).toString(), key };
}

/** After the browser's upload: checks the file is in the bucket within the cap,
 * then records it for the note. A file it replaces is deleted from the bucket. */
export async function confirmNoteAudio(
  db: Kysely<Database>,
  store: AudioStore | undefined,
  course: { id: string; slug: string },
  document: CourseDocument,
  target: { episodeId: string; nodeId: string },
  key: string,
  onCleanupError: (error: unknown) => void
): Promise<void> {
  if (!store) throw new ValidationError('Audio storage is not configured on this server');
  const note = noteOf(document, target);
  if (!key.startsWith(audioKeyPrefix(course.slug)) || !/^[0-9a-f-]{36}\.mp3$/.test(key.slice(audioKeyPrefix(course.slug).length))) throw new ValidationError('That is not a file of this course');
  const size = await store.size(key);
  if (size === null || size === 0) throw new ValidationError('The audio was not uploaded');
  if (size > CONFIG.courses.maxNoteAudioBytes) {
    await store.delete(key).catch(onCleanupError);
    throw new ValidationError('That note is too long to voice; shorten it');
  }
  await checkCourseCap(db, course.id, note.hash, size);
  const replaced = await courseAudioRepo.upsert(db, course.id, note.hash, key, size);
  if (replaced) await store.delete(replaced).catch(onCleanupError);
}

async function checkCourseCap(db: Kysely<Database>, courseId: string, textHash: string, size: number): Promise<void> {
  const used = (await courseAudioRepo.files(db, courseId)).reduce((total, file) => (file.textHash === textHash ? total : total + file.size), 0);
  if (used + size > CONFIG.courses.maxCourseAudioBytes) throw new ValidationError("The course's notes are too long to voice; shorten some");
}
