import { isLegalFen } from '@freechesscoach/chess-analysis';
import { EnginePingRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { runEnginePing } from '../services/engine-ping.js';
import type { ResolveEngineBackendOptions } from '../services/engine/resolve-engine-backend.js';
import * as userProfileService from '../services/user-profile.js';

/** The settings page's engine ping test (Engine → "Engine ping test"): the
 * user types a FEN (the shared ENGINE_PING_FEN default is deliberately
 * absent from the Lichess bin) and gets back what the app's normal engine
 * pipeline returns for it — which tier served it, how long the pipeline
 * took, and the eval/depth/line count — so a broken or slow engine setting
 * is visible from Settings without importing a game. */
export function registerEnginePingRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  engineBackendOptions: ResolveEngineBackendOptions
): void {
  app.post('/api/engine/ping', async (request) => {
    const parsed = EnginePingRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    if (!isLegalFen(parsed.data.fen)) {
      throw new ValidationError('Not a valid FEN position.');
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    return runEnginePing(engineBackendOptions, user.id, parsed.data.fen);
  });
}
