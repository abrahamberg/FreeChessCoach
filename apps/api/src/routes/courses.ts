import {
  ImportCourseRequestSchema,
  NoteAudioConfirmRequestSchema,
  NoteAudioUploadRequestSchema,
  PublishCourseRequestSchema,
  UpdateCourseRequestSchema,
  type CourseListResponse,
  type CourseResponse,
  type ImportCourseResponse,
  type NoteAudioUploadResponse,
  type PublishCheckResponse
} from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { parseRequest } from '../lib/parse-request.js';
import { rateLimitConfig, ROUTE_RATE_LIMITS } from '../plugins/route-rate-limit.js';
import { TOKEN_API_PREFIX } from '../plugins/auth-headers.js';
import * as coursesService from '../services/courses/course-drafts.js';
import { importCourse } from '../services/courses/course-import.js';
import type { CourseDossierBuilder } from '../services/courses/dossier.js';
import { confirmNoteAudio, requestNoteAudioUpload } from '../services/courses/note-audio.js';
import type { AudioStore } from '../services/courses/audio-store.js';
import { publishCheck, publishCourse } from '../services/courses/publish.js';
import { requireCourseEditor } from '../services/courses/require-course-editor.js';
import * as userProfileService from '../services/user-profile.js';

const CourseParamsSchema = z.object({ id: z.string().uuid() });
const NoteParamsSchema = z.object({ id: z.string().uuid(), episodeId: z.string().min(1).max(40), nodeId: z.string().regex(/^n\d+$/) });

export interface CoursesRouteDeps {
  /** Absent when the app has no engine; then an import is refused. */
  buildDossier: CourseDossierBuilder | undefined;
  /** The bucket the note audio lives in (docs/courses.md §8); absent without one. */
  audioStore?: AudioStore;
}

/**
 * The course editors' API (docs/courses.md §2, §9): every course is every
 * editor's. Served twice with the same handlers: under `/api/courses` for
 * the signed-in browser (the Courses page), and under `/api/token/courses`
 * for tools holding an editor's token (the studio). Every route checks
 * `requireCourseEditor`.
 */
export function registerCoursesRoutes(app: FastifyInstance, db: Kysely<Database>, deps: CoursesRouteDeps): void {
  for (const base of ['/api/courses', `${TOKEN_API_PREFIX}courses`]) registerAt(app, db, deps, base);
}

function registerAt(app: FastifyInstance, db: Kysely<Database>, deps: CoursesRouteDeps, base: string): void {
  const editorId = async (request: FastifyRequest): Promise<string> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    requireCourseEditor(user);
    return user.id;
  };
  const audioBaseUrl = deps.audioStore?.publicUrl ?? null;
  const audioCleanup = (request: FastifyRequest) => deps.audioStore && { store: deps.audioStore, onError: (error: unknown) => request.log.error({ err: error }, 'course audio cleanup failed') };

  app.get(base, async (request): Promise<CourseListResponse> => {
    await editorId(request);
    return coursesService.listCourses(db);
  });

  /** A finished course from the studio: new, or replacing the one at its slug. */
  app.put(`${base}/import`, rateLimitConfig(ROUTE_RATE_LIMITS.courseImport), async (request): Promise<ImportCourseResponse> => {
    const id = await editorId(request);
    return importCourse(db, id, parseRequest(ImportCourseRequestSchema, request.body), { buildDossier: deps.buildDossier, audioBaseUrl });
  });

  app.get(`${base}/:id`, async (request): Promise<CourseResponse> => {
    await editorId(request);
    return coursesService.getCourse(db, courseId(request), audioBaseUrl);
  });

  /** Visibility, members' level, posted video links. */
  app.patch(`${base}/:id`, async (request): Promise<CourseResponse> => {
    await editorId(request);
    return coursesService.updateCourse(db, courseId(request), parseRequest(UpdateCourseRequestSchema, request.body), audioBaseUrl);
  });

  /** 204. */
  app.delete(`${base}/:id`, async (request, reply) => {
    await editorId(request);
    await coursesService.deleteCourse(db, courseId(request), audioCleanup(request));
    return reply.code(204).send();
  });

  /** §9: the checks over the draft, with the engine facts. */
  app.get(`${base}/:id/publish-check`, async (request): Promise<PublishCheckResponse> => {
    await editorId(request);
    return publishCheck(db, courseId(request));
  });

  /** §9: publish the draft (unlisted unless the editor picks public). */
  app.post(`${base}/:id/publish`, async (request): Promise<CourseResponse> => {
    await editorId(request);
    const body = parseRequest(PublishCourseRequestSchema, request.body ?? {});
    return publishCourse(db, courseId(request), body, audioCleanup(request));
  });

  /** §8: a signed URL to upload one note's MP3 to, as its draft text reads now. */
  app.post(`${base}/:id/notes/:episodeId/:nodeId/audio-url`, async (request): Promise<NoteAudioUploadResponse> => {
    await editorId(request);
    const params = noteParams(request);
    const body = parseRequest(NoteAudioUploadRequestSchema, request.body);
    const course = await coursesService.courseById(db, params.id);
    return requestNoteAudioUpload(db, deps.audioStore, course, coursesService.storedDocument(course), params, body.size);
  });

  /** §8: the file is in the bucket; record it for the note. 204. */
  app.put(`${base}/:id/notes/:episodeId/:nodeId/audio`, async (request, reply) => {
    await editorId(request);
    const params = noteParams(request);
    const body = parseRequest(NoteAudioConfirmRequestSchema, request.body);
    const course = await coursesService.courseById(db, params.id);
    const onError = (error: unknown): void => request.log.error({ err: error }, 'course audio cleanup failed');
    await confirmNoteAudio(db, deps.audioStore, course, coursesService.storedDocument(course), params, body.key, onError);
    return reply.code(204).send();
  });
}

function courseId(request: FastifyRequest): string {
  const parsed = CourseParamsSchema.safeParse(request.params);
  if (!parsed.success) throw new NotFoundError('Course not found');
  return parsed.data.id;
}

function noteParams(request: FastifyRequest): z.infer<typeof NoteParamsSchema> {
  const parsed = NoteParamsSchema.safeParse(request.params);
  if (!parsed.success) throw new NotFoundError('Note not found');
  return parsed.data;
}
