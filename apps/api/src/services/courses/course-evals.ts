import { courseTreeFens, rateCourseNodes, type CourseTree } from '@freechesscoach/chess-analysis';
import type { CourseNodeEvals, CourseResponse, EngineEval } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { EngineBackend } from '../engine/engine-backend.js';
import { resolveReviewEngineBackend, type ResolveEngineBackendOptions } from '../engine/resolve-engine-backend.js';
import { courseTreeOf } from './generation-inputs.js';
import { notBeingWritten, ownedCourse, storedDocument, toCourseResponse } from './course-drafts.js';

/** Rates a tree as `userId`; injected into the course routes so their tests
 * need no engine. */
export type CourseEvalsBuilder = (tree: CourseTree, learnerSide: 'white' | 'black', userId: string) => Promise<CourseNodeEvals>;

/** The app's builder: the engine pipeline game review uses (Lichess eval
 * index first, then the user's engine setting). */
export function courseEvalsBuilderFor(options: ResolveEngineBackendOptions): CourseEvalsBuilder {
  return async (tree, learnerSide, userId) => rateTreeWithEngine(tree, learnerSide, await resolveReviewEngineBackend(options, userId));
}

/** One batch for every distinct position of the tree, two lines each. */
export async function rateTreeWithEngine(tree: CourseTree, learnerSide: 'white' | 'black', engine: Pick<EngineBackend, 'analyzeGame'>): Promise<CourseNodeEvals> {
  const fens = courseTreeFens(tree);
  const evals = await engine.analyzeGame(fens, { multiPv: 2, minLines: 2 });
  const evalsByFen = new Map<string, EngineEval>();
  fens.forEach((fen, index) => {
    const evaluation = evals[index];
    if (evaluation) evalsByFen.set(fen, { ...evaluation, fen });
  });
  return rateCourseNodes(tree, learnerSide, evalsByFen);
}

/** On demand: rates the draft's moves now and keeps them on the course, so
 * the eval bar and the move icons work on a course written by hand or sent
 * through the api. Call it again after the tree changes. */
export async function analyzeCourse(db: Kysely<Database>, ownerId: string, id: string, build: CourseEvalsBuilder): Promise<CourseResponse> {
  const row = await ownedCourse(db, ownerId, id);
  notBeingWritten(row);
  const document = storedDocument(row);
  const evals = await build(courseTreeOf(document), document.learnerSide, ownerId);
  const saved = await coursesRepo.setEvals(db, id, ownerId, evals);
  if (!saved) throw new NotFoundError('Course not found');
  return toCourseResponse(db, saved);
}
