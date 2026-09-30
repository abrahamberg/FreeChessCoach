import { createHash } from 'node:crypto';
import { CONFIG } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

/** Course notes are voiced by Kokoro only (docs/courses.md §8), uploaded as
 * WAV. Not MP3: that is what the OpenAI voice gives. */
export const NOTE_AUDIO_TYPES = ['audio/wav'] as const;

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
  const stored = await courseAudioRepo.sizes(db, courseId);
  return noteHashes(document)
    .filter((note) => !stored.has(note.hash))
    .map(({ episodeId, nodeId }) => ({ episodeId, nodeId }));
}

/** docs/courses.md §8: stores the audio for one note of the draft, as its
 * text reads now. Only a note that exists can be voiced, within the caps. */
export async function saveNoteAudio(
  db: Kysely<Database>,
  courseId: string,
  document: CourseDocument,
  target: { episodeId: string; nodeId: string },
  audio: { mimeType: string; bytes: Buffer }
): Promise<void> {
  const note = noteHashes(document).find((each) => each.episodeId === target.episodeId && each.nodeId === target.nodeId);
  if (!note) throw new NotFoundError('That note is not in the draft');
  if (!(NOTE_AUDIO_TYPES as readonly string[]).includes(audio.mimeType)) throw new ValidationError('Note audio must be WAV');
  if (!audio.bytes.length) throw new ValidationError('The audio is empty');
  if (audio.bytes.length > CONFIG.courses.maxNoteAudioBytes) throw new ValidationError('That note is too long to voice; shorten it');
  const stored = await courseAudioRepo.sizes(db, courseId);
  const used = [...stored].reduce((total, [hash, size]) => (hash === note.hash ? total : total + size), 0);
  if (used + audio.bytes.length > CONFIG.courses.maxCourseAudioBytes) throw new ValidationError("The course's notes are too long to voice; shorten some");
  await courseAudioRepo.upsert(db, courseId, note.hash, audio);
}
