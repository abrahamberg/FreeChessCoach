import {
  CreateCourseRequestSchema,
  PublishCourseRequestSchema,
  RegenerateEpisodeRequestSchema,
  SaveCourseDraftRequestSchema,
  StartCourseGenerationRequestSchema,
  type CourseDebugResponse,
  type CourseListResponse,
  type CourseResponse
} from '@freechesscoach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/schema.js';
import { EngineUnavailableError, NotFoundError, ValidationError } from '../lib/errors.js';
import type { JobQueue } from '../jobs/queue.js';
import type { ModelResolution } from '../llm/gateway.js';
import type { CourseDossierBuilder } from '../services/course-dossier.js';
import * as courseGenerate from '../services/course-generate.js';
import * as coursesService from '../services/courses.js';
import { NOTE_AUDIO_TYPES, saveNoteAudio } from '../services/courses/note-audio.js';
import type { AudioMirror } from '../services/courses/audio-mirror.js';
import { publishCourse } from '../services/courses/publish.js';
import { requireCourseCreator } from '../services/courses/require-course-creator.js';
import { CONFIG } from '@freechesscoach/chess-analysis';
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
  /** The R2 copy of published note audio (docs/courses.md §9); absent without one. */
  audioMirror?: AudioMirror;
}

/**
 * The creator's course editor (docs/courses.md §2, §5.2, §10). Every route
 * is behind `requireCourseCreator`.
 */
export function registerCoursesRoutes(app: FastifyInstance, db: Kysely<Database>, deps: CoursesRouteDeps): void {
  const { buildDossier } = deps;
  // Note audio arrives as the raw file (docs/courses.md §8).
  app.addContentTypeParser([...NOTE_AUDIO_TYPES], { parseAs: 'buffer', bodyLimit: CONFIG.courses.maxNoteAudioBytes }, (_request, body, done) => done(null, body));
  const creatorId = async (request: FastifyRequest): Promise<string> => {
    const user = await userProfileService.getOrCreate(db, request.user);
    requireCourseCreator(user);
    return user.id;
  };

  app.post('/api/courses', async (request, reply): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const course = await coursesService.createCourse(db, ownerId, parseBody(CreateCourseRequestSchema, request.body));
    return reply.code(201).send(course);
  });

  app.get('/api/courses', async (request): Promise<CourseListResponse> => coursesService.listCourses(db, await creatorId(request)));

  app.get('/api/courses/:id', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    return coursesService.getCourse(db, ownerId, courseId(request));
  });

  /** Task 80.6: every AI call of the latest run, prompts and answers as they were. */
  app.get('/api/courses/:id/debug', async (request): Promise<CourseDebugResponse> => {
    const ownerId = await creatorId(request);
    return courseGenerate.courseDebug(db, ownerId, courseId(request));
  });

  /** 204, like every PUT in this app; the client already holds what it saved. */
  app.put('/api/courses/:id/draft', async (request, reply) => {
    const ownerId = await creatorId(request);
    const { document } = parseBody(SaveCourseDraftRequestSchema, request.body);
    await coursesService.saveDraft(db, ownerId, courseId(request), document);
    return reply.code(204).send();
  });

  app.post('/api/courses/:id/skeleton', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    if (!buildDossier) throw new EngineUnavailableError('No engine is configured');
    return coursesService.buildSkeletonDraft(db, ownerId, courseId(request), buildDossier);
  });

  /** 202: the worker writes the draft; the editor polls GET for progress. */
  app.post('/api/courses/:id/generate', async (request, reply): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const { restart } = parseBody(StartCourseGenerationRequestSchema, request.body ?? {});
    const course = await courseGenerate.startCourseGeneration(db, deps.jobQueue, ownerId, courseId(request), restart);
    return reply.code(202).send(course);
  });

  /** §9: publish the draft (unlisted unless the creator picks public). */
  app.post('/api/courses/:id/publish', async (request): Promise<CourseResponse> => {
    const ownerId = await creatorId(request);
    const body = parseBody(PublishCourseRequestSchema, request.body ?? {});
    const mirror = deps.audioMirror && { mirror: deps.audioMirror, onError: (error: unknown) => request.log.error({ err: error }, 'course audio mirror sync failed') };
    return publishCourse(db, ownerId, courseId(request), body, mirror);
  });

  /** §8: one note's audio, as its draft text reads now. 204. */
  app.put('/api/courses/:id/notes/:episodeId/:nodeId/audio', async (request, reply) => {
    const ownerId = await creatorId(request);
    const params = NoteParamsSchema.safeParse(request.params);
    if (!params.success) throw new NotFoundError('Note not found');
    const course = await coursesService.ownedCourse(db, ownerId, params.data.id);
    const mimeType = (request.headers['content-type'] ?? '').split(';')[0]!.trim();
    if (!Buffer.isBuffer(request.body)) throw new ValidationError('Send the audio file as the request body');
    await saveNoteAudio(db, course.id, coursesService.storedDocument(course), params.data, { mimeType, bytes: request.body });
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
    const { instruction } = parseBody(RegenerateEpisodeRequestSchema, request.body ?? {});
    const generateDeps = { db, buildDossier, resolveModel: deps.resolveModel };
    return courseGenerate.regenerateCourseEpisode(generateDeps, ownerId, params.data.id, params.data.episodeId, instruction);
  });
}

function courseId(request: FastifyRequest): string {
  const parsed = CourseParamsSchema.safeParse(request.params);
  if (!parsed.success) throw new NotFoundError('Course not found');
  return parsed.data.id;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
  return parsed.data;
}
