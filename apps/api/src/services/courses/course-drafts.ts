import type { CourseDocument, CourseListResponse, CourseResponse, UpdateCourseRequest } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { AudioStore } from './audio-store.js';
import { noteAudio } from './note-audio.js';
import { courseEvals } from './public-course.js';

/** Every course, for the editors' Courses page: all editors share them (docs/courses.md §2). */
export async function listCourses(db: Kysely<Database>): Promise<CourseListResponse> {
  const rows = await coursesRepo.listAll(db);
  return {
    courses: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      status: row.status,
      accessLevel: row.accessLevel,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      promise: row.promise ?? '',
      episodes: row.episodes ?? 0,
      moves: row.moves ?? 0,
      level: row.level ?? null
    }))
  };
}

export async function getCourse(db: Kysely<Database>, id: string, audioBaseUrl: string | null): Promise<CourseResponse> {
  return toCourseResponse(db, await courseById(db, id), audioBaseUrl);
}

/**
 * docs/courses.md §9: the editor's visibility and video links. `draft`
 * takes a published course off the site; `unlisted` and `public` need a
 * published copy (Publish makes one). A course a moderator removed stays removed.
 */
export async function updateCourse(db: Kysely<Database>, id: string, update: UpdateCourseRequest, audioBaseUrl: string | null): Promise<CourseResponse> {
  const row = await courseById(db, id);
  if (row.status === 'removed') throw new ConflictError('This course was removed by a moderator');
  if ((update.status === 'unlisted' || update.status === 'public') && !row.publishedDocument) throw new ConflictError('Publish the course first');
  if (update.status !== undefined || update.accessLevel !== undefined) await coursesRepo.setVisibility(db, id, { status: update.status, accessLevel: update.accessLevel });
  if (update.clipLinks) await coursesRepo.setClipLinks(db, id, update.clipLinks);
  return getCourse(db, id, audioBaseUrl);
}

/** Deletes the course, published or not: its link stops working and its
 * audio leaves the bucket (a failure there never fails the delete).
 * Learner progress is keyed by position, shared with other courses, so it stays. */
export async function deleteCourse(db: Kysely<Database>, id: string, audio?: { store: AudioStore; onError: (error: unknown) => void }): Promise<void> {
  const keys = await coursesRepo.remove(db, id);
  if (!keys) throw new NotFoundError('Course not found');
  if (audio) await Promise.all(keys.map((key) => audio.store.delete(key).catch(audio.onError)));
}

/** Any course: every editor edits every course (docs/courses.md §2). */
export async function courseById(db: Kysely<Database>, id: string): Promise<coursesRepo.CourseRow> {
  const row = await coursesRepo.findById(db, id);
  if (!row) throw new NotFoundError('Course not found');
  return row;
}

export function storedDocument(row: coursesRepo.CourseRow): CourseDocument {
  if (!row.document) throw new NotFoundError('Course has no draft');
  return row.document;
}

/** `audioBaseUrl`: the bucket's public address, for the notes' audio URLs. */
export async function toCourseResponse(db: Kysely<Database>, row: coursesRepo.CourseRow, audioBaseUrl: string | null): Promise<CourseResponse> {
  const document = storedDocument(row);
  const audio = await noteAudio(db, row.id, document, audioBaseUrl);
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    accessLevel: row.accessLevel,
    title: row.title,
    direction: row.direction,
    document,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    noteAudio: audio.urls,
    missingNoteAudio: audio.missing,
    evals: courseEvals(document, row.dossier)
  };
}
