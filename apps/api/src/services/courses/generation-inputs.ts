import { buildCourseSkeleton, courseLineGames, type CourseDossier, type CourseLineGame, type CourseSkeleton, type CourseTree } from '@freechesscoach/chess-analysis';
import type { CourseMessages, CoursePromptContext } from '@freechesscoach/prompts';
import type { CourseDocument } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { z } from 'zod';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import type { CourseDossierBuilder } from '../course-dossier.js';
import { courseHeaders } from './intake-text.js';

/** One structured call with the creator's model. Resolved per call, so an
 * unlock that expires mid-run stops the job at the next call. */
export type CourseModelCall = <T>(messages: CourseMessages, schema: z.ZodType<T>) => Promise<T>;

export interface GenerationInputs {
  document: CourseDocument;
  tree: CourseTree;
  lineGames: CourseLineGame[];
  dossier: CourseDossier;
  skeleton: CourseSkeleton | null;
  context: CoursePromptContext;
}

/** The dossier is built once and kept on the course (0014_course_dossier.ts). */
export async function loadGenerationInputs(
  db: Kysely<Database>,
  row: coursesRepo.CourseRow,
  document: CourseDocument,
  buildDossier: CourseDossierBuilder | undefined
): Promise<GenerationInputs> {
  const tree: CourseTree = { startFen: document.startFen, nodes: document.nodes, lines: document.lines, errors: [] };
  const lineGames = courseLineGames(tree);
  let dossier = row.dossier;
  if (!dossier) {
    if (!buildDossier) throw new Error('No engine is configured');
    dossier = (await buildDossier(tree, document.learnerSide, row.ownerId)).dossier;
    await coursesRepo.setDossier(db, row.id, dossier);
  }
  const skeleton = buildCourseSkeleton({ kind: document.kind, tree, lines: lineGames, dossier });
  const context: CoursePromptContext = {
    kind: document.kind,
    persona: document.coachPersona,
    learnerSide: document.learnerSide,
    levelBand: document.levelBand,
    direction: row.direction,
    startFen: document.startFen,
    nodes: document.nodes,
    lines: document.lines,
    dossier,
    skeleton,
    headers: courseHeaders(row.sourcePgn)
  };
  return { document, tree, lineGames, dossier, skeleton, context };
}
