import { courseDiagnosisCodes } from '@freechesscoach/chess-analysis';
import type { CourseDocument, DiagnosisCodeId, ImportCourseRequest, ImportCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { ConflictError, EngineUnavailableError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { toCourseResponse } from './course-drafts.js';
import { assertQuizSide, parseCourseSource } from './course-source.js';
import type { CourseDossierBuilder } from './dossier.js';
import { draftProblem } from './draft-checks.js';
import { draftCheckProblems } from './publish.js';

type ImportRequest = Required<ImportCourseRequest>;

/**
 * docs/courses.md §2: a finished course from the studio, stored under its
 * slug, new or in place (id, status and published copy kept). The app
 * trusts nothing it can check itself: it parses the PGN, refuses a document
 * whose moves differ from it, and builds the dossier with its own engine
 * pipeline, the one Game Review uses. The answer carries the publish check.
 */
export async function importCourse(
  db: Kysely<Database>,
  editorId: string,
  request: ImportRequest,
  deps: { buildDossier: CourseDossierBuilder | undefined; audioBaseUrl: string | null }
): Promise<ImportCourseResponse> {
  const existing = await coursesRepo.findBySlug(db, request.slug);
  if (existing?.status === 'removed') throw new ConflictError('A moderator removed the course at this address');
  if (existing && existing.kind !== request.document.kind) throw new ValidationError('The course kind cannot change');
  const content = request.document.kind === 'reading' ? readingContent(request) : await movesContent(request, editorId, deps.buildDossier);
  const row = existing ? await coursesRepo.replaceContent(db, existing.id, content) : await coursesRepo.insert(db, { ...content, createdBy: editorId, slug: request.slug });
  if (!row) throw new NotFoundError('Course not found');
  return { ...(await toCourseResponse(db, row, deps.audioBaseUrl)), problems: draftCheckProblems(content.document, row), created: !existing };
}

/** A reading course is its pages: no moves, so nothing for the engine. */
function readingContent(request: ImportRequest): coursesRepo.CourseContent {
  if (request.document.nodes.length) throw new ValidationError('A reading course has no moves');
  return { sourcePgn: request.pgn, direction: request.direction, document: request.document, dossier: null };
}

async function movesContent(request: ImportRequest, editorId: string, buildDossier: CourseDossierBuilder | undefined): Promise<coursesRepo.CourseContent> {
  const { document } = request;
  if (document.kind === 'reading') throw new ValidationError('A reading course has no moves');
  const tree = parseCourseSource(request.pgn, document.kind);
  assertQuizSide(tree, document.learnerSide);
  const problem = draftProblem({ ...document, startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines }, document);
  if (problem) throw new ValidationError(problem);
  if (!buildDossier) throw new EngineUnavailableError('No engine is configured');
  const { dossier } = await buildDossier(tree, document.learnerSide, editorId, document.kind);
  return { sourcePgn: request.pgn, direction: request.direction, document: withDiagnosisCodes(document, courseDiagnosisCodes(tree, dossier)), dossier };
}

/** The codes the studio chose, or the dossier's when it chose none. */
function withDiagnosisCodes(document: CourseDocument, fromDossier: DiagnosisCodeId[]): CourseDocument {
  return document.diagnosisCodes.length ? document : { ...document, diagnosisCodes: fromDossier };
}
