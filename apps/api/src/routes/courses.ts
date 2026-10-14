import type { CourseDossier } from '@freechesscoach/chess-analysis';
import {
  CreateCourseRequestSchema,
  NoteAudioConfirmRequestSchema,
  NoteAudioUploadRequestSchema,
  PublishCourseRequestSchema,
  RegenerateEpisodeRequestSchema,
  ReplaceCourseRequestSchema,
  SaveCourseDraftRequestSchema,
  StartCourseGenerationRequestSchema,
  type CourseDebugResponse,
  type CourseListResponse,
  type CourseResponse,
  type NoteAudioUploadResponse,
  type PublishCheckResponse,
  type ReplaceCourseResponse
} from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { EngineUnavailableError, NotFoundError, ValidationError } from '../lib/errors.js';
import { parseRequest } from '../lib/parse-request.js';
import type { JobQueue } from '../jobs/queue.js';
import type { ModelResolution } from '../llm/gateway.js';
import type { CourseDossierBuilder } from '../services/courses/dossier.js';
import * as courseGenerate from '../services/courses/generation.js';
import * as coursesService from '../services/courses/course-drafts.js';
import { confirmNoteAudio, requestNoteAudioUpload } from '../services/courses/note-audio.js';
import type { AudioStore } from '../services/courses/audio-store.js';
import { publishCheck, publishCourse } from '../services/courses/publish.js';
import { requireCourseCreator } from '../services/courses/require-course-creator.js';
import * as userProfileService from '../services/user-profile.js';

const CourseParamsSchema = z.object({ id: z.string().uuid() });
const EpisodeParamsSchema = z.object({ id: z.string().uuid(), episodeId: z.string().min(1).max(40) });
const NoteParamsSchema = EpisodeParamsSchema.extend({ nodeId: z.string().regex(/^n\d+$/) });

export interface CoursesRouteDeps {
  /** Absent when the app has no engine; then building the skeleton is refused. */
  buildDossier: CourseDossierBuilder | undefined;
  jobQueue: JobQueue;
  /** The creator's standard-tier model, for regenerating one episode in the request. */
  resolveModel: ((userId: string) => Promise<ModelResolution>) | undefined;
  /** The bucket the note audio lives in (docs/courses.md §8); absent without one. */
  audioStore?: AudioStore;
}

/**
 * The creator's course editor (docs/courses.md §2, §5.2, §10). Every route
 * is behind `requireCourseCreator`.
 */
export function registerCoursesRoutes(app: FastifyInstance, db: Kysely<Database>, deps: CoursesRouteDeps): void {
  const { buildDossier } = deps;
  const creatorId = async (request: FastifyRequest): Promise<string> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    requireCourseCreator(user);
    return user.id;
  };

  app.post('/api/courses', async (request, reply): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const course = await coursesService.createCourse(db, ownerId, parseRequest(CreateCourseRequestSchema, request.body));
    return reply.code(201).send(course);
  });

  app.get('/api/courses', async (request): Promise<CourseListResponse> => coursesService.listCourses(db, await creatorId(request)));

  app.get('/api/courses/:id', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    return coursesService.getCourse(db, ownerId, courseId(request));
  });

  /** 204. Refused while the AI is writing it; the studio confirms first. */
  app.delete('/api/courses/:id', async (request, reply) => {
    const ownerId = await creatorId(request);
    const store = deps.audioStore && { store: deps.audioStore, onError: (error: unknown) => request.log.error({ err: error }, 'course audio cleanup failed') };
    await coursesService.deleteCourse(db, ownerId, courseId(request), store);
    return reply.code(204).send();
  });

  /** Task 80.6: every AI call of the latest run, prompts and answers as they were. */
  app.get('/api/courses/:id/debug', async (request): Promise<CourseDebugResponse> => {
    const ownerId = await creatorId(request);
    return courseGenerate.courseDebug(db, ownerId, courseId(request));
  });

  /** 204, like every PUT in this app; the client already holds what it saved. */
  app.put('/api/courses/:id/draft', async (request, reply) => {
    const ownerId = await creatorId(request);
    const { document } = parseRequest(SaveCourseDraftRequestSchema, request.body);
    await coursesService.saveDraft(db, ownerId, courseId(request), document);
    return reply.code(204).send();
  });

  app.post('/api/courses/:id/skeleton', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    if (!buildDossier) throw new EngineUnavailableError('No engine is configured');
    return coursesService.buildSkeletonDraft(db, ownerId, courseId(request), buildDossier);
  });

  /** The content studio's finished course, in place; the published copy
   * stays until Publish. */
  app.put('/api/courses/:id/document', async (request): Promise<ReplaceCourseResponse> => {
    const ownerId = await creatorId(request);
    const { dossier, ...body } = parseRequest(ReplaceCourseRequestSchema, request.body);
    const course = await coursesService.replaceCourse(db, ownerId, courseId(request), { ...body, dossier: dossier as unknown as CourseDossier });
    return { ...course, ...(await publishCheck(db, ownerId, course.id)) };
  });

  /** 202: the worker writes the draft; the editor polls GET for progress. */
  app.post('/api/courses/:id/generate', async (request, reply): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const { restart } = parseRequest(StartCourseGenerationRequestSchema, request.body ?? {});
    const course = await courseGenerate.startCourseGeneration(db, deps.jobQueue, ownerId, courseId(request), restart);
    return reply.code(202).send(course);
  });

  /** §9: the checks over the draft, with the engine facts, before anything is voiced. */
  app.get('/api/courses/:id/publish-check', async (request): Promise<PublishCheckResponse> => {
    const ownerId = await creatorId(request);
    return publishCheck(db, ownerId, courseId(request));
  });

  /** §9: publish the draft (unlisted unless the creator picks public). */
  app.post('/api/courses/:id/publish', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const body = parseRequest(PublishCourseRequestSchema, request.body ?? {});
    const store = deps.audioStore && { store: deps.audioStore, onError: (error: unknown) => request.log.error({ err: error }, 'course audio cleanup failed') };
    return publishCourse(db, ownerId, courseId(request), body, store);
  });

  /** §8: a signed URL to upload one note's MP3 to, as its draft text reads now. */
  app.post('/api/courses/:id/notes/:episodeId/:nodeId/audio-url', async (request): Promise<NoteAudioUploadResponse> => {
    const ownerId = await creatorId(request);
    const params = NoteParamsSchema.safeParse(request.params);
    if (!params.success) throw new NotFoundError('Note not found');
    const body = parseRequest(NoteAudioUploadRequestSchema, request.body);
    const course = await coursesService.ownedCourse(db, ownerId, params.data.id);
    return requestNoteAudioUpload(db, deps.audioStore, course, coursesService.storedDocument(course), params.data, body.size);
  });

  /** §8: the browser has uploaded that file; record it for the note. 204. */
  app.put('/api/courses/:id/notes/:episodeId/:nodeId/audio', async (request, reply) => {
    const ownerId = await creatorId(request);
    const params = NoteParamsSchema.safeParse(request.params);
    if (!params.success) throw new NotFoundError('Note not found');
    const body = parseRequest(NoteAudioConfirmRequestSchema, request.body);
    const course = await coursesService.ownedCourse(db, ownerId, params.data.id);
    const onError = (error: unknown): void => request.log.error({ err: error }, 'course audio cleanup failed');
    await confirmNoteAudio(db, deps.audioStore, course, coursesService.storedDocument(course), params.data, body.key, onError);
    return reply.code(204).send();
  });

  /** §13.1: the reel alone, written now (one model call). */
  app.post('/api/courses/:id/reel', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    if (!deps.resolveModel) throw new ValidationError('AI is not configured on this server');
    return courseGenerate.writeCourseReel({ db, buildDossier, resolveModel: deps.resolveModel }, ownerId, courseId(request));
  });

  app.post('/api/courses/:id/episodes/:episodeId/regenerate', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const params = EpisodeParamsSchema.safeParse(request.params);
    if (!params.success) throw new NotFoundError('Episode not found');
    if (!deps.resolveModel) throw new ValidationError('AI is not configured on this server');
    const { instruction } = parseRequest(RegenerateEpisodeRequestSchema, request.body ?? {});
    const generateDeps = { db, buildDossier, resolveModel: deps.resolveModel };
    return courseGenerate.regenerateCourseEpisode(generateDeps, ownerId, params.data.id, params.data.episodeId, instruction);
  });
}

function courseId(request: FastifyRequest): string {
  const parsed = CourseParamsSchema.safeParse(request.params);
  if (!parsed.success) throw new NotFoundError('Course not found');
  return parsed.data.id;
}
