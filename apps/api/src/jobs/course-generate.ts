import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { getModelForUser, type GatewayConfig } from '../llm/gateway.js';
import { courseDossierBuilderFor } from '../services/courses/dossier.js';
import { runCourseGeneration, type CourseGenerateDeps } from '../services/courses/generation.js';
import type { ResolveEngineBackendOptions } from '../services/engine/resolve-engine-backend.js';

export interface CourseGenerateJobPayload {
  courseId: string;
}

export interface CourseGenerateTaskOptions {
  db: Kysely<Database>;
  gatewayConfig: GatewayConfig;
  engineBackendOptions: ResolveEngineBackendOptions;
}

/** The app's generation deps: the engine the review uses, and the creator's
 * model at the standard tier. */
export function courseGenerateDepsFor(db: Kysely<Database>, gatewayConfig: GatewayConfig, engineBackendOptions: ResolveEngineBackendOptions | undefined): CourseGenerateDeps {
  return {
    db,
    buildDossier: engineBackendOptions ? courseDossierBuilderFor(engineBackendOptions) : undefined,
    resolveModel: (userId) => getModelForUser(db, gatewayConfig, userId, 'standard')
  };
}

/** graphile-worker Task around services/courses/generation.ts (docs/courses.md §5.2). */
export function createCourseGenerateTask(options: CourseGenerateTaskOptions): Task {
  const deps = courseGenerateDepsFor(options.db, options.gatewayConfig, options.engineBackendOptions);
  return async (payload) => {
    const { courseId } = payload as CourseGenerateJobPayload;
    await runCourseGeneration(deps, courseId);
  };
}
