import type { CourseDossier, CourseLineAnalysis, CourseTree } from '@freechesscoach/chess-analysis';
import { buildCourseDossierFromEngine } from '../../src/services/courses/dossier.js';
import { parseCourseSource } from '../../src/services/courses/course-source.js';
import type { EngineBackend } from '../../src/services/engine/engine-backend.js';
import type { GoldenCourse } from '../fixtures/courses/golden-set.js';

/** A golden course's tree and dossier as the import builds them, with each
 * line's analysis (its moves' review notes). */
export async function goldenDossier(course: GoldenCourse, engine: EngineBackend): Promise<{ tree: CourseTree; dossier: CourseDossier; analysis: CourseLineAnalysis[] }> {
  const tree = parseCourseSource(course.pgn, course.kind);
  const { dossier, lines } = await buildCourseDossierFromEngine(tree, course.learnerSide, engine, course.kind);
  return { tree, dossier, analysis: lines };
}
