import {
  buildCourseSkeleton,
  inferLearnerSide,
  parseCourseTree,
  type CourseTree
} from '@freechesscoach/chess-analysis';
import {
  CreateCourseRequestSchema,
  type CourseDocument,
  type CourseGeneration,
  type CourseListResponse,
  type CourseResponse
} from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { z } from 'zod';
import * as coursesRepo from '../db/repositories/courses.js';
import type { Database } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { CourseDossierBuilder } from './course-dossier.js';
import { draftProblem } from './courses/draft-checks.js';
import { buildManualEpisodes } from './courses/manual-episodes.js';
import { courseSlug, courseTitle, resultHeader } from './courses/intake-text.js';

/** Bounds the one engine batch the skeleton runs (a long master game with
 * a few sidelines fits; a whole repertoire does not). */
export const MAX_COURSE_NODES = 400;

export type CourseIntake = z.output<typeof CreateCourseRequestSchema>;

/** The intake form's PGN becomes the fixed move tree of a new draft. */
export async function createCourse(db: Kysely<Database>, ownerId: string, intake: CourseIntake): Promise<CourseResponse> {
  const document = draftFromIntake(intake);
  const title = document.title;
  const row = await coursesRepo.insert(db, {
    ownerId,
    slug: courseSlug(title),
    kind: intake.kind,
    title,
    sourcePgn: intake.pgn,
    direction: intake.direction,
    document
  });
  return toCourseResponse(row);
}

/** The new draft for an intake: the tree, the learner side (inferred when
 * not given) and empty episodes. Throws a `ValidationError` the creator can read. */
export function draftFromIntake(intake: CourseIntake): CourseDocument {
  const tree = parseCourseTree(intake.pgn);
  if (tree.errors.length) throw new ValidationError(tree.errors.map((error) => error.message).join('; '));
  if (!tree.nodes.length) throw new ValidationError('The PGN has no moves');
  if (tree.nodes.length > MAX_COURSE_NODES) throw new ValidationError(`A course can have at most ${MAX_COURSE_NODES} moves`);
  const learnerSide = intake.learnerSide ?? inferLearnerSide(intake.kind, tree, resultHeader(intake.pgn));
  if (!learnerSide) throw new ValidationError('Pick the learner side: it cannot be told from this PGN');
  return {
    version: 1,
    kind: intake.kind,
    title: courseTitle(intake.direction),
    promise: '',
    learnerSide,
    levelBand: intake.levelBand,
    coachPersona: intake.coachPersona,
    startFen: tree.startFen,
    nodes: tree.nodes,
    lines: tree.lines,
    chapters: [],
    episodes: [],
    takeaways: [],
    hookOptions: [],
    clipLinks: {}
  };
}

export async function listCourses(db: Kysely<Database>, ownerId: string): Promise<CourseListResponse> {
  const rows = await coursesRepo.listByOwner(db, ownerId);
  return {
    courses: rows.map((row) => ({ id: row.id, slug: row.slug, kind: row.kind, status: row.status, title: row.title, updatedAt: row.updatedAt.toISOString() }))
  };
}

export async function getCourse(db: Kysely<Database>, ownerId: string, id: string): Promise<CourseResponse> {
  return toCourseResponse(await ownedCourse(db, ownerId, id));
}

export async function saveDraft(db: Kysely<Database>, ownerId: string, id: string, document: CourseDocument): Promise<void> {
  const row = await ownedCourse(db, ownerId, id);
  const problem = draftProblem(storedDocument(row), document);
  if (problem) throw new ValidationError(problem);
  const saved = await coursesRepo.updateDraft(db, id, ownerId, document);
  if (!saved) throw new NotFoundError('Course not found');
}

/** "Build without AI" (docs/courses.md §10): the skeleton's episodes with
 * template text replace the draft's chapters and episodes. */
export async function buildSkeletonDraft(db: Kysely<Database>, ownerId: string, id: string, buildDossier: CourseDossierBuilder): Promise<CourseResponse> {
  const row = await ownedCourse(db, ownerId, id);
  const document = storedDocument(row);
  const tree: CourseTree = { startFen: document.startFen, nodes: document.nodes, lines: document.lines, errors: [] };
  const { dossier, lines } = await buildDossier(tree, document.learnerSide, ownerId);
  const lineGames = lines.map((analysis) => analysis.line);
  const skeleton = buildCourseSkeleton({ kind: document.kind, tree, lines: lineGames, dossier });
  if (!skeleton) throw new ValidationError('No trap found: no move by the other side loses ground on this line');
  const { chapters, episodes } = buildManualEpisodes({ document, skeleton, dossier, lines: lineGames });
  const saved = await coursesRepo.updateDraft(db, id, ownerId, { ...document, chapters, episodes });
  if (!saved) throw new NotFoundError('Course not found');
  return toCourseResponse(saved);
}

export async function ownedCourse(db: Kysely<Database>, ownerId: string, id: string): Promise<coursesRepo.CourseRow> {
  const row = await coursesRepo.findByIdForOwner(db, id, ownerId);
  if (!row) throw new NotFoundError('Course not found');
  return row;
}

export function storedDocument(row: coursesRepo.CourseRow): CourseDocument {
  if (!row.document) throw new NotFoundError('Course has no draft');
  return row.document;
}

/** A run whose worker stopped beating this long ago was killed mid-job. */
export const GENERATION_STALE_MS = 3 * 60_000;

/** The generation as the creator should see it: a running job with no
 * recent heartbeat died with its worker, so it reads as failed (and resumes). */
export function liveGeneration(generation: CourseGeneration | null, now = Date.now()): CourseGeneration | null {
  if (generation?.status !== 'running') return generation;
  const beat = generation.heartbeatAt ? Date.parse(generation.heartbeatAt) : 0;
  if (now - beat < GENERATION_STALE_MS) return generation;
  return { ...generation, status: 'failed', step: null, error: 'The writing stopped unexpectedly. Resume writing to carry on.' };
}

export function toCourseResponse(row: coursesRepo.CourseRow): CourseResponse {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    title: row.title,
    direction: row.direction,
    document: storedDocument(row),
    generation: liveGeneration(row.generation),
    updatedAt: row.updatedAt.toISOString()
  };
}
