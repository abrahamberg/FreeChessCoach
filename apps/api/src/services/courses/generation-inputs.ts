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
  let dossier = row.dossier;
  if (!dossier) {
    if (!buildDossier) throw new Error('No engine is configured');
    dossier = (await buildDossier(courseTreeOf(document), document.learnerSide, row.ownerId)).dossier;
    await coursesRepo.setDossier(db, row.id, dossier);
  }
  return generationInputs({ document, dossier, direction: row.direction, sourcePgn: row.sourcePgn });
}

/** The draft's fixed tree, as chess-analysis reads it. */
export function courseTreeOf(document: CourseDocument): CourseTree {
  return { startFen: document.startFen, nodes: document.nodes, lines: document.lines, errors: [] };
}

/** Everything the calls need, from a draft and its dossier; no database
 * (the golden-set script uses it directly). */
export function generationInputs(input: { document: CourseDocument; dossier: CourseDossier; direction: string; sourcePgn: string }): GenerationInputs {
  const { document, dossier } = input;
  const tree = courseTreeOf(document);
  const lineGames = courseLineGames(tree);
  const skeleton = buildCourseSkeleton({ kind: document.kind, tree, lines: lineGames, dossier });
  const context: CoursePromptContext = {
    kind: document.kind,
    persona: document.coachPersona,
    learnerSide: document.learnerSide,
    levelBand: document.levelBand,
    direction: input.direction,
    startFen: document.startFen,
    nodes: document.nodes,
    lines: document.lines,
    dossier,
    skeleton,
    headers: courseHeaders(input.sourcePgn)
  };
  return { document, tree, lineGames, dossier, skeleton, context };
}
