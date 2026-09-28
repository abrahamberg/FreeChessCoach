import { CourseDocumentSchema, type PublicCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { noteHashes } from './note-audio.js';

const NOT_FOUND = 'No course at this link';

/** Note audio files are named by their bytes' hash; only WAV is stored (§8). */
const AUDIO_FILE = /^([0-9a-f]{32})\.wav$/;

/** docs/courses.md §9: the frozen published copy, and each note's audio file.
 * The file is named by its content, so its URL never serves different bytes
 * and Cloudflare can keep it at the edge. Drafts and removed courses are 404,
 * like a wrong link. */
export async function publicCourse(db: Kysely<Database>, slug: string): Promise<PublicCourseResponse> {
  const row = await coursesRepo.findPublishedBySlug(db, slug);
  if (!row?.publishedDocument || !row.publishedAt) throw new NotFoundError(NOT_FOUND);
  const document = CourseDocumentSchema.parse(row.publishedDocument);
  const files = await courseAudioRepo.contentHashes(db, row.id);
  const noteAudio = Object.fromEntries(
    noteHashes(document).flatMap((note) => {
      const content = files.get(note.hash);
      return content ? [[`${note.episodeId}:${note.nodeId}`, `/api/public/courses/${row.slug}/audio/${content}.wav`]] : [];
    })
  );
  return { slug: row.slug, publishedAt: row.publishedAt.toISOString(), document, noteAudio };
}

/** One note's audio file, only while a note of the published copy says it. */
export async function publicNoteAudio(db: Kysely<Database>, slug: string, file: string): Promise<courseAudioRepo.CourseAudio> {
  const content = AUDIO_FILE.exec(file)?.[1];
  const row = content ? await coursesRepo.findPublishedBySlug(db, slug) : undefined;
  if (!content || !row?.publishedDocument) throw new NotFoundError('No such note audio');
  const audio = await courseAudioRepo.findByContent(db, row.id, content);
  const document = CourseDocumentSchema.parse(row.publishedDocument);
  if (!audio || !noteHashes(document).some((note) => note.hash === audio.textHash)) throw new NotFoundError('No such note audio');
  return { mimeType: audio.mimeType, bytes: audio.bytes };
}
