import { CourseDocumentSchema, type PublicCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { noteHashes } from './note-audio.js';

const NOT_FOUND = 'No course at this link';

/** docs/courses.md §9: the frozen published copy, with the notes whose audio
 * was uploaded. Drafts and removed courses are 404, like a wrong link. */
export async function publicCourse(db: Kysely<Database>, slug: string): Promise<PublicCourseResponse> {
  const row = await coursesRepo.findPublishedBySlug(db, slug);
  if (!row?.publishedDocument || !row.publishedAt) throw new NotFoundError(NOT_FOUND);
  const document = CourseDocumentSchema.parse(row.publishedDocument);
  const stored = await courseAudioRepo.sizes(db, row.id);
  const noteAudio = Object.fromEntries(
    noteHashes(document)
      .filter((note) => stored.has(note.hash))
      .map((note) => [`${note.episodeId}:${note.nodeId}`, note.hash])
  );
  return { slug: row.slug, publishedAt: row.publishedAt.toISOString(), document, noteAudio };
}

/** One note's audio, only when a note of the published copy says that text. */
export async function publicNoteAudio(db: Kysely<Database>, slug: string, hash: string): Promise<courseAudioRepo.CourseAudio> {
  const row = await coursesRepo.findPublishedBySlug(db, slug);
  if (!row?.publishedDocument) throw new NotFoundError(NOT_FOUND);
  const document = CourseDocumentSchema.parse(row.publishedDocument);
  if (!noteHashes(document).some((note) => note.hash === hash)) throw new NotFoundError('No such note audio');
  const audio = await courseAudioRepo.find(db, row.id, hash);
  if (!audio) throw new NotFoundError('No such note audio');
  return audio;
}
