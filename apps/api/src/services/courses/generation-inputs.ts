import { buildCourseSkeleton, courseLineGames, isQuizAnswerEligible, reelCandidates, type CourseDossier, type CourseLineGame, type CourseSkeleton, type CourseTree } from '@freechesscoach/chess-analysis';
import type { CourseMessages, CoursePlanChapter, CoursePromptContext } from '@freechesscoach/prompts';
import { courseVideos, type CourseDocument } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { z } from 'zod';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import type { CourseDossierBuilder } from '../course-dossier.js';
import { courseHeaders } from './intake-text.js';
import { buildManualEpisodes } from './manual-episodes.js';

/** Which call of a run this is: the debug log's row and the golden script's
 * counts (Task 80.6). */
export interface CourseCallLabel {
  step: 'outline' | 'episode' | 'reel';
  episodeId: string | null;
  repair: boolean;
}

/** One structured call with the creator's model. Resolved per call, so an
 * unlock that expires mid-run stops the job at the next call. `checked`
 * hears what the outline checks or the verifier found in that call's answer. */
export interface CourseModelCall {
  <T>(messages: CourseMessages, schema: z.ZodType<T>, label: CourseCallLabel): Promise<T>;
  checked?: (label: CourseCallLabel, problems: string[]) => Promise<void>;
}

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
    dossier = (await buildDossier(courseTreeOf(document), document.learnerSide, row.ownerId, document.kind)).dossier;
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
    videos: courseVideos(document),
    direction: input.direction,
    startFen: document.startFen,
    nodes: document.nodes,
    lines: document.lines,
    dossier,
    skeleton,
    plan: skeleton ? coursePlan(document, skeleton, dossier, lineGames) : null,
    headers: courseHeaders(input.sourcePgn),
    reelCandidates: reelCandidates(tree, dossier, skeleton)
  };
  return { document, tree, lineGames, dossier, skeleton, context };
}

/** §10's episodes as spans: the outline prompt asks the model to keep them,
 * and the outline falls back to them when the model's fails twice. */
function coursePlan(document: CourseDocument, skeleton: CourseSkeleton, dossier: CourseDossier, lines: CourseLineGame[]): CoursePlanChapter[] {
  const manual = buildManualEpisodes({ document, skeleton, dossier, lines });
  const byId = new Map(manual.episodes.map((episode) => [episode.id, episode]));
  return manual.chapters.map((chapter) => ({
    title: chapter.title,
    lineId: chapter.lineId,
    episodes: chapter.episodeIds.flatMap((id) => {
      const episode = byId.get(id);
      if (!episode) return [];
      // The skeleton's answer can miss the quiz check (no clear only move).
      const answer = episode.quiz?.answerNodeId ?? null;
      const answerNodeId = answer && isQuizAnswerEligible(document.kind, dossier, answer) ? answer : null;
      return [{ id, role: episode.role, focus: episode.focus, startNodeId: episode.startNodeId, endNodeId: episode.endNodeId, answerNodeId }];
    })
  }));
}
