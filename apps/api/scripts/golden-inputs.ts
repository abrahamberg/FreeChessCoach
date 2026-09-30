import type { GoldenCourse } from '../test/fixtures/courses/golden-set.js';
import { buildCourseDossierFromEngine } from '../src/services/courses/dossier.js';
import { draftFromIntake } from '../src/services/courses/course-drafts.js';
import { courseTreeOf, generationInputs, type GenerationInputs } from '../src/services/courses/generation-inputs.js';
import type { EngineBackend } from '../src/services/engine/engine-backend.js';

/** The draft and its engine dossier, as a run starts from them. */
export async function courseInputs(course: GoldenCourse, engine: EngineBackend, engineUrl: string): Promise<GenerationInputs> {
  const document = draftFromIntake(course.intake);
  const { dossier } = await buildCourseDossierFromEngine(courseTreeOf(document), document.learnerSide, engine, document.kind).catch((error: unknown) => {
    throw new Error(`the engine at ${engineUrl} failed (${error instanceof Error ? error.message : String(error)}); is the dev stack up?`);
  });
  return generationInputs({ document, dossier, direction: course.intake.direction, sourcePgn: course.intake.pgn });
}
