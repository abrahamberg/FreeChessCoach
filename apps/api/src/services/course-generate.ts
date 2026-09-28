import { verifyCourseFrame, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import { REEL_WARNINGS, type CourseDebugResponse, type CourseDocument, type CourseEpisode, type CourseGeneration, type CourseOutline, type CourseResponse, type CourseWarning } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as coursesRepo from '../db/repositories/courses.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import * as courseAiCallsRepo from '../db/repositories/course-ai-calls.js';
import type { ModelResolution } from '../llm/gateway.js';
import type { CourseDossierBuilder } from './course-dossier.js';
import { liveGeneration, ownedCourse, storedDocument, toCourseResponse } from './courses.js';
import { writeEpisode } from './courses/generate-episode.js';
import { writeReel } from './courses/generate-reel.js';
import { documentFromOutline, planOutline } from './courses/generate-outline.js';
import { loggedCourseCall } from './courses/debug-log.js';
import { loadGenerationInputs, type CourseModelCall } from './courses/generation-inputs.js';

export interface CourseGenerateDeps {
  db: Kysely<Database>;
  /** Absent when the app has no engine; a course whose dossier is stored still works. */
  buildDossier: CourseDossierBuilder | undefined;
  /** The creator's own model at the standard tier (§5.2). */
  resolveModel: (userId: string) => Promise<ModelResolution>;
}

const ACTIVE = new Set(['queued', 'running']);
/** How often a running job says it is alive; well inside GENERATION_STALE_MS. */
const HEARTBEAT_MS = 30_000;

function freshGeneration(): CourseGeneration {
  return { status: 'queued', step: null, done: 0, total: 0, error: null, outline: null, finishedEpisodeIds: [], warnings: [] };
}

/**
 * Queues the job. A failed run with an outline resumes (its finished
 * episodes are kept); anything else, or `restart`, starts over.
 */
export async function startCourseGeneration(db: Kysely<Database>, jobQueue: JobQueue, ownerId: string, id: string, restart: boolean): Promise<CourseResponse> {
  const row = await ownedCourse(db, ownerId, id);
  storedDocument(row);
  const current = liveGeneration(row.generation);
  if (current && ACTIVE.has(current.status) && !restart) throw new ConflictError('The course is already being written');
  const resume = !restart && current?.status === 'failed' && current.outline !== null;
  const generation: CourseGeneration = resume ? { ...current, status: 'queued', error: null } : freshGeneration();
  if (!resume) await courseAiCallsRepo.clear(db, id);
  await coursesRepo.setGeneration(db, id, generation);
  await jobQueue.enqueueCourseGenerate(id);
  return toCourseResponse(db, { ...row, generation });
}

/**
 * docs/courses.md §5.2, the worker job: dossier → skeleton → outline →
 * one call per episode → verifier → one repair → the draft, with warnings.
 * Each finished episode is saved at once, so a stopped job loses nothing.
 * A `ValidationError` (the unlock expired) ends the run as failed without
 * rethrowing; anything else is recorded and rethrown for the worker's log.
 */
export async function runCourseGeneration(deps: CourseGenerateDeps, courseId: string): Promise<void> {
  const row = await coursesRepo.findById(deps.db, courseId);
  if (!row) throw new NotFoundError(`Course ${courseId} not found`);
  let state = row.generation ?? freshGeneration();
  const save = async (patch: Partial<CourseGeneration>): Promise<void> => {
    state = { ...state, ...patch, heartbeatAt: new Date().toISOString() };
    await coursesRepo.setGeneration(deps.db, courseId, state);
  };
  // A slow local model can spend minutes on one call; the beat shows the
  // job is still alive, and stops with the process if the worker is killed.
  const heartbeat = setInterval(() => void coursesRepo.touchGeneration(deps.db, courseId, new Date()).catch(() => undefined), HEARTBEAT_MS);

  try {
    await save({ status: 'running', step: 'Analysing positions', error: null });
    let document = storedDocument(row);
    const inputs = await loadGenerationInputs(deps.db, row, document, deps.buildDossier);
    const call = modelCall(deps, row.ownerId, courseId);

    let outline = state.outline;
    if (!outline) {
      await save({ step: 'Planning' });
      const planned = await planOutline(inputs, call);
      outline = planned.outline;
      document = documentFromOutline(inputs, outline);
      await saveDocument(deps.db, row, document);
      await save({ outline, finishedEpisodeIds: [], warnings: planned.warnings });
    }

    const episodes = outline.chapters.flatMap((chapter) => chapter.episodes);
    // §13.3: the reel is written after the episodes, as one more step.
    const total = episodes.length + (document.reel ? 1 : 0);
    for (const [index, planned] of episodes.entries()) {
      if (state.finishedEpisodeIds.includes(planned.id)) continue;
      await save({ step: `Writing episode ${index + 1} of ${episodes.length}`, done: state.finishedEpisodeIds.length, total });
      const written = await writeEpisode({ ...inputs, document }, outline, planned.id, call);
      document = withEpisode(document, written.episode);
      await saveDocument(deps.db, row, document);
      await save({ finishedEpisodeIds: [...state.finishedEpisodeIds, planned.id], warnings: withWarnings(state.warnings, planned.id, written.warnings) });
    }
    if (document.reel && !state.finishedEpisodeIds.includes(REEL_WARNINGS)) {
      await save({ step: 'Writing the reel', done: state.finishedEpisodeIds.length, total });
      const written = await writeReel({ ...inputs, document }, document, document.reel, call);
      document = { ...document, reel: written.reel };
      await saveDocument(deps.db, row, document);
      await save({ finishedEpisodeIds: [...state.finishedEpisodeIds, REEL_WARNINGS], warnings: withWarnings(state.warnings, REEL_WARNINGS, written.warnings) });
    }
    await save({ status: 'succeeded', step: null, done: total, total, warnings: withCourseWarnings(state.warnings, courseWarnings(document, inputs.skeleton)) });
  } catch (error) {
    await save({ status: 'failed', step: null, error: error instanceof Error ? error.message : String(error) });
    if (!(error instanceof ValidationError)) throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

/** §6.5: one episode again, with the creator's instruction, in the request. */
export async function regenerateCourseEpisode(deps: CourseGenerateDeps, ownerId: string, id: string, episodeId: string, instruction: string): Promise<CourseResponse> {
  const row = await ownedCourse(deps.db, ownerId, id);
  const generation = liveGeneration(row.generation);
  const outline: CourseOutline | null = generation?.outline ?? null;
  if (generation && ACTIVE.has(generation.status)) throw new ConflictError('The course is still being written');
  if (!generation || !outline) throw new ValidationError('Write the course with AI first');
  if (!outline.chapters.some((chapter) => chapter.episodes.some((episode) => episode.id === episodeId))) throw new NotFoundError('Episode not found');

  const document = storedDocument(row);
  const inputs = await loadGenerationInputs(deps.db, row, document, deps.buildDossier);
  const written = await writeEpisode(inputs, outline, episodeId, modelCall(deps, ownerId, id), instruction || null);
  const saved = await saveDocument(deps.db, row, withEpisode(document, written.episode));
  const next: CourseGeneration = { ...generation, warnings: withWarnings(generation.warnings, episodeId, written.warnings) };
  await coursesRepo.setGeneration(deps.db, id, next);
  return toCourseResponse(deps.db, { ...saved, generation: next });
}

/** Task 80.6: the AI calls of the course's latest run, for its owner. */
export async function courseDebug(db: Kysely<Database>, ownerId: string, id: string): Promise<CourseDebugResponse> {
  await ownedCourse(db, ownerId, id);
  return { calls: await courseAiCallsRepo.listForCourse(db, id) };
}

/** Every call is logged for the creator's "Debug AI calls" view (Task 80.6). */
function modelCall(deps: CourseGenerateDeps, ownerId: string, courseId: string): CourseModelCall {
  return loggedCourseCall({ db: deps.db, courseId, resolve: () => deps.resolveModel(ownerId) });
}

async function saveDocument(db: Kysely<Database>, row: coursesRepo.CourseRow, document: CourseDocument): Promise<coursesRepo.CourseRow> {
  const saved = await coursesRepo.updateDraft(db, row.id, row.ownerId, document);
  if (!saved) throw new NotFoundError('Course not found');
  return saved;
}

function withEpisode(document: CourseDocument, episode: CourseEpisode): CourseDocument {
  const exists = document.episodes.some((candidate) => candidate.id === episode.id);
  return {
    ...document,
    episodes: exists ? document.episodes.map((candidate) => (candidate.id === episode.id ? episode : candidate)) : [...document.episodes, episode]
  };
}

/** §13.9's whole-course checks (the video's packaging, the voice across
 * episodes) and a puzzle's second solutions, recomputed at the end of a run. */
function courseWarnings(document: CourseDocument, skeleton: CourseSkeleton | null): CourseWarning[] {
  const frame = verifyCourseFrame(document).map((problem) => ({ episodeId: null, ...problem }));
  const unsound = skeleton?.kind === 'puzzle' ? skeleton.unsoundNodeIds : [];
  const puzzle = unsound.map((nodeId) => ({ episodeId: null, code: 'puzzle', nodeId, message: `The engine finds another good move at ${nodeId}: the puzzle has two answers there` }));
  return [...frame, ...puzzle];
}

/** The outline's warnings stay; the whole-course ones are replaced. */
function withCourseWarnings(warnings: CourseWarning[], fresh: CourseWarning[]): CourseWarning[] {
  return [...warnings.filter((warning) => warning.episodeId !== null || warning.code === 'outline'), ...fresh];
}

function withWarnings(warnings: CourseWarning[], episodeId: string, fresh: CourseWarning[]): CourseWarning[] {
  return [...warnings.filter((warning) => warning.episodeId !== episodeId), ...fresh];
}
